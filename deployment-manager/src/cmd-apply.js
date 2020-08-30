const fs = require('fs').promises;
const {join, dirname} = require('path');

const yaml = require('js-yaml');
const chalk = require('chalk');
const execa = require('execa');

const Loader = require('./loader.js');
const Runner = require('./runner.js');
const Kubernetes = require('./kubernetes.js');

const {DUSTJS_DEPLOYMENTS_DIR, DUSTJS_APPS_PATH} = process.env;

exports.builder = yargs => yargs
  .array('only')
  .default('only', ['firebase', 'backend', 'services'])
  .default('backend-image-tag', 'latest')
  .default('deployments-dir', DUSTJS_DEPLOYMENTS_DIR)
  .default('dustjs-path', '/home/dan/Code/@stardustapp/dustjs')
  .default('apps-path', DUSTJS_APPS_PATH)
;

exports.handler = async argv => {
  const loader = new Loader(process.cwd());
  const runner = new Runner();

  async function runNpmBuild(modulePath) {
    const output = await runner.execUtility(`npm`, [`run`, `build`], {
      cwd: modulePath,
    });
    const createdLine = output.stderr.split('\n')
      .find(str => str.includes('created') && str.includes('.js') && !str.includes('.cjs.js'));
    if (createdLine) {
      console.log(`   `, createdLine);
      return createdLine;
    }
  }

  // console.log('input:', argv);
  console.log();
  const project = await loader.loadProjectConfig(argv);
  await project.fetchMissingPackages();
  console.log();

  if (argv.only.includes('firebase') && argv['dustjs-path']) {
    console.log(`==>`, `Checking for local @dustjs modules to package directly`);
    Runner.registerKnownDir(argv['dustjs-path'], '$DustJsCheckout');

    for (const [library, _] of project.libraryDirs) {
      if (!library.npm_module.startsWith('@dustjs/') && !library.source) continue;

      const baseName = library.npm_module.split('/')[1];
      const srcPath = library.source
        ? join(process.cwd(), library.source)
        : join(argv['dustjs-path'], baseName);
      const exists = await fs.access(join(srcPath, 'package.json'))
        .then(() => true, () => false);
      if (!exists) {
        console.log('!-> Skipping local library', library.npm_module, `because it wasn't found at`, srcPath);
        continue;
      }

      console.log(`--> Building ${library.npm_module} locally`);
      if (await runNpmBuild(srcPath)) {
        project.libraryDirs.set(library, srcPath);
      } else {
        console.log('!-> Skipping local library', library.npm_module, `because the build didn't work right`);
      }
    }
    console.log();
  }

  if (argv.only.includes('firebase')) {
    console.log(`--> Preparing fresh public directory`);
    const targetDir = join('firebase', 'public-generated');
    Runner.registerKnownDir(targetDir, '$WebTarget');

    // start with the static html
    await runner.execUtility('rm', ['-rf', targetDir]);
    await runner.execUtility('cp', ['-ra', join('firebase', 'public'), targetDir]);

    // the apps
    for (const app of project.resolvedApps) {
      const webTarget = join(targetDir, app.id);

      const staticBundle = (app.appConfig.bundles || [])
        .find(x => x.type === 'static html');
      if (staticBundle) {
        await runner.execUtility('cp', ['-ra',
          join(app.directory, staticBundle.source),
          webTarget]);
        continue;
      }

      const rollupBundle = (app.appConfig.bundles || [])
        .find(x => x.type === 'rollup');
      if (rollupBundle) {
        console.log(`--> Building ${app.id} locally`);
        if (await runNpmBuild(join(app.directory, rollupBundle.source))) {
          await runner.execUtility('cp', ['-ra',
            join(app.directory, rollupBundle.source, 'dist'),
            webTarget]);
        } else {
          console.log('!-> Skipping local app', app.id, `because the build didn't work right`);
        }
        continue;
      }

      console.log('!-> WARN: App', app.id, 'lacks a static HTML bundle');
    }

    // js libraries
    const libDir = join(targetDir, '~~', 'lib');
    await runner.execUtility('mkdir', ['-p', libDir]);
    for (const lib of project.projectConfig.hosted_libraries || []) {
      const cacheDir = project.libraryDirs.get(lib);
      if (!cacheDir) throw new Error(
        `BUG: ${lib.npm_module} wasn't found locally`);

      const baseDir = join(cacheDir, lib.sub_path || '');
      const destDir = join(libDir, lib.npm_module.replace('/', '-'));
      switch (true) {
        case 'paths' in lib:
          await runner.execUtility('mkdir', [destDir]);
          for (const path of lib.paths) {
            await runner.execUtility('cp', ['-a', join(baseDir, path), join(destDir, path)]);
          }
          break;
        case 'patterns' in lib:
          await runner.execUtility('mkdir', [destDir]);
          const pattern = new RegExp('^.\\/'+lib.patterns.map(x => x.replace(/\//g, '\\/')).join('|')+'$', 'gm');
          const findCmd = await runner.execUtility(`find`, ['.', '-type', 'f'], {cwd: baseDir});
          const dirs = new Set('.');
          const matches = findCmd.stdout.match(pattern) || [];
          for (const path of matches) {
            const dir = dirname(path);
            if (dir && !dirs.has(dir)) {
              await runner.execUtility('mkdir', ['-p', join(destDir, dir)]);
              dirs.add(dir);
            }
            await runner.execUtility('cp', ['-a', join(baseDir, path), join(destDir, path)]);
          }
          if (matches.length < 1) {
            console.log('!-> WARN: Library folder', cacheDir, 'has no files match for', pattern);
          }
          break;
        default:
          await runner.execUtility('cp', ['-ra', baseDir, destDir]);
      }
    }

    const targets = ['hosting'];

    // check if we have functions
    const funcsExist = await fs.access(join('firebase', 'functions'))
      .then(() => true, () => false);
    if (funcsExist) {
      targets.push('functions');

      // copy schemas into the functions in case they're useful
      console.log(`    Adding backend schemas to functions`);
      await runner.execUtility('rm', ['-rf', join('firebase', 'functions', 'schemas')]);
      await runner.execUtility('mkdir', [join('firebase', 'functions', 'schemas')]);
      for (const app of project.resolvedApps) {
        const target = join('firebase', 'functions', 'schemas', `${app.id}.mjs`);
        await runner.execUtility('cp', [join(app.directory, 'schema.mjs'), target]);
      }
      const {extraSchemasDir} = project.projectConfig;
      if (extraSchemasDir) {
        for (const schemaFile of await fs.readdir(extraSchemasDir)) {
          const target = join('firebase', 'functions', 'schemas', schemaFile);
          await runner.execUtility('cp', [join(extraSchemasDir, schemaFile), target]);
        }
      }
    }

    console.log(`==> ${chalk.magenta.bold('Deploying')} to Firebase Hosting...`);
    const args = ['deploy', '--only', targets.join(','), '--public', 'public-generated'];
    const fireDeploy = await runner.execUtility(`firebase`, args, {
      cwd: join(process.cwd(), 'firebase'),
    });

    await runner.execUtility('rm', ['-rf', targetDir]);
    if (fireDeploy.stdout.includes('release complete')) {
      console.log(`==> ${chalk.green.bold('Hosting looks good!')} Yay :)`);
    } else {
      console.log(`!-> Something's off with the firebase CLI, this is what I saw:`);
      console.log(fireDeploy.stdout);
      process.exit(5);
    }
    console.log();
  }

  const hasKubernetes = 'kubernetes' in project.deploymentConfig.backend_deployment;

  if (argv.only.includes('backend') && hasKubernetes) {
    console.log(`--> Preparing backend kustomization`);
    const targetDir = await runner.createTempDir();

    await runner.execUtility('cp', [join(__dirname, '..', 'files', 'kustomize-skeletons', 'deployment.yaml'), targetDir]);
    await runner.execUtility('cp', [join(__dirname, '..', 'files', 'kustomize-skeletons', 'service.yaml'), targetDir]);

    const {
      kubernetes, allowed_origins, domain, env,
    } = project.deploymentConfig.backend_deployment;

    await writeFile(join(targetDir, 'ingress.yaml'), yaml.safeDump(Kubernetes.generateIngress({
      serviceName: 'api',
      annotations: kubernetes.ingressAnnotations,
      domains: [domain],
    })));

    const {
      project_id, database_url, admin_uids,
    } = project.deploymentConfig.authority.firebase;

    await writeFile(join(targetDir, 'deployment-patch.yaml'), yaml.safeDump(Kubernetes.generateDeploymentPatch('api', {
      deployment: kubernetes.replicas == null ? {} : {
        replicas: kubernetes.replicas,
      },
      container: {
        env: [
          { name: 'FIREBASE_PROJECT_ID', value: project_id },
          { name: 'FIREBASE_DATABASE_URL', value: database_url },
          { name: 'FIREBASE_ADMIN_UIDS', value: (admin_uids||[]).join(',') },
          { name: 'SKYLINK_ALLOWED_ORIGINS', value: allowed_origins.join(',') },
        ],
      }})));

    await writeFile(join(targetDir, 'kustomization.yaml'), yaml.safeDump({
      commonLabels: kubernetes.labels,
      namespace: kubernetes.namespace,
      namePrefix: `${project_id}-`,
      resources: [
        'deployment.yaml',
        'service.yaml',
        'ingress.yaml',
      ],
      patchesStrategicMerge: [
        'deployment-patch.yaml',
      ],
      configMapGenerator: [{
        name: 'api-schemas',
        files: project.resolvedApps.map(app => `${app.id}.mjs=schemas/${app.id}.mjs`),
      }],
      secretGenerator: [{
        name: 'api-files',
        files: ['firebase-service-account.json'],
      },{
        name: 'api-env',
        env: 'api.env',
      }],
      images: [{
        name: 'dustjs-backend-firebase',
        newName: 'gcr.io/stardust-156404/dustjs-backend-firebase',
        newTag: argv['backend-image-tag'],
      }],
    }));

    console.log(`    Adding backend schemas`);
    await runner.execUtility('mkdir', [join(targetDir, 'schemas')]);
    for (const app of project.resolvedApps) {
      const target = join(targetDir, 'schemas', `${app.id}.mjs`);
      await runner.execUtility('cp', [join(app.directory, 'schema.mjs'), target]);
    }

    const {extraSchemasDir} = project.projectConfig;
    if (extraSchemasDir) {
      for (const schemaFile of await fs.readdir(extraSchemasDir)) {
        const target = join(targetDir, 'schemas', schemaFile);
        await runner.execUtility('cp', [join(extraSchemasDir, schemaFile), target]);
      }
    }

    try {
      console.log(`    Adding secrets`);
      await runner.execUtility('cp', [join(project.configDir, 'firebase-service-account.json'), targetDir]);
      await writeFile(join(targetDir, 'api.env'), Object.keys(env).map(key => `${key}=${env[key]}`).join(`\n`)+`\n`);

      // const kustomized = await runner.execUtility('kustomize', ['build', targetDir]);
      // console.log(kustomized.stdout);
      console.log(`==> ${chalk.magenta.bold('Deploying')} to Kubernetes...`);
      const kustomized = await visiblyExecWithSpecificRetry(runner, 'kubectl', ['--context='+kubernetes.context, 'apply', '-k', targetDir]);
    } finally {
      await runner.execUtility('rm', ['-rf', targetDir]);
    }

    const kubectl = new Kubernetes.Client(kubernetes.context, kubernetes.namespace);

    console.log(`--> Waiting for deployment to stabilize`);
    const finalPods = await kubectl
      .pollForPodStability(kubernetes.labels);
    const podS = finalPods.length === 1 ? '' : 's';
    const verb = finalPods.length === 1 ? 'is' : 'are';
    console.log(`==> ${chalk.green.bold('Backend looks good!')} ${chalk.green(`${finalPods.length} pod${podS}`)} ${verb} in service. :)`);
    console.log();
  }



  if (argv.only.includes('services') && hasKubernetes) {
    console.log(`--> Preparing services kustomization`);
    const targetDir = await runner.createTempDir();

    const configMapGenerator = new Array;

    // the apps
    for (const app of project.resolvedApps) {
      const routineBundle = (app.appConfig.bundles || [])
        .find(x => x.type === 'app routines');
      if (!routineBundle) {
        // console.log('--> App', app.id, 'lacks a routines bundle');
        continue;
      }

      const token = `routines-${app.id}`;
      const svcsSource = join(app.directory, routineBundle.source);
      const svcsTarget = join(targetDir, token);
      await runner.execUtility('cp', ['-ra',
        svcsSource, svcsTarget]);

      const files = await fs.readdir(svcsTarget);
      configMapGenerator.push({
        name: token,
        files: files.map(file => `${file}=${token}/${file}`),
      });
    }

    const {
      kubernetes, allowed_origins, domain, env,
    } = project.deploymentConfig.backend_deployment;

    await writeFile(join(targetDir, 'kustomization.yaml'), yaml.safeDump({
      // commonLabels: kubernetes.labels,
      namespace: kubernetes.namespace,
      // namePrefix: `${project_id}-`,
      configMapGenerator,
    }));

    console.log(`==> ${chalk.magenta.bold('Deploying')} Routines to Kubernetes...`);
    const kustomized = await visiblyExecWithSpecificRetry(runner, 'kubectl', ['--context='+kubernetes.context, 'apply', '-k', targetDir]);
    for (const line of kustomized.stdout.split('\n')) {
      console.log('   ', line);
    }

    console.log(`==> ${chalk.green.bold('Routines look good!')}`);
    console.log();
  }



}

async function writeFile(path, contents) {
  console.log(`    ${chalk.gray.bold('cat')} ${chalk.gray(`> ${path}`)}`);
  await fs.writeFile(path, contents, 'utf-8');
}

async function visiblyExecWithSpecificRetry(runner, ...stuff) {
  try {
    return await runner.execUtility(...stuff);
  } catch (err) {
    if (err.stderr && err.stderr.includes('context deadline exceeded')) {
      console.log('    control plane connection issue, retrying once');
      return await runner.execUtility(...stuff);
    }
    throw err;
  }
}
