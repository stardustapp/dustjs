const fs = require('fs').promises;
const {join} = require('path');

const yaml = require('js-yaml');
const chalk = require('chalk');
const execa = require('execa');

const Loader = require('./loader.js');
const Kubernetes = require('./kubernetes.js');

const {DUSTJS_DEPLOYMENTS_DIR, DUSTJS_APPS_PATH} = process.env;

exports.builder = yargs => yargs
  // .positional('port', {
  //   describe: 'port to bind on',
  //   default: 5000
  // })
  .array('only')
  .default('only', ['firebase', 'backend'])
  .default('backend-image-tag', 'latest')
  .default('deployments-dir', DUSTJS_DEPLOYMENTS_DIR)
  .default('client-lib-dir', '/home/dan/Code/@stardustapp/dustjs/client')
  .default('client-vue-lib-dir', '/home/dan/Code/@stardustapp/dustjs/client-vue')
  .default('apps-path', DUSTJS_APPS_PATH)
;

exports.handler = async argv => {
  // console.log('input:', argv);
  console.log();
  const {
    configDir,
    projectConfig,
    resolvedApps,
  } = await Loader.loadProjectConfig(process.cwd(), argv);
  console.log();

  let clientLibs = new Array;

  // TODO: fetch these from unpkg (cache locally?) if no checkout
  // TODO: if checkout... then run a build?
  if (argv.only.includes('client-library')) {
    console.log(`==> Building @dustjs/client locally`);
    const path = argv['client-lib-dir'];
    const jsFile = 'dustjs-client.umd.js';
    clientLibs.push(join(path, 'dist', jsFile));
    clientLibs.push(join(path, 'dist', jsFile+'.map'));

    const output = await visiblyExec(`npm`, [`run`, `build`], {
      cwd: join(path),
    });
    const createdLine = output.stdout.split('\n')
      .find(str => str.includes('created') && str.includes(jsFile));
    console.log(`-->`, createdLine || 'rollup completed weirdly!');
    console.log();
  }
  if (argv.only.includes('client-vue')) {
    console.log(`==> Building @dustjs/client-vue locally`);
    const path = argv['client-vue-lib-dir'];
    const jsFile = 'dustjs-client-vue.umd.js';
    clientLibs.push(join(path, 'dist', jsFile));
    clientLibs.push(join(path, 'dist', jsFile+'.map'));
    const cssFile = 'dustjs-client-vue.css';
    clientLibs.push(join(path, 'dist', cssFile));

    const output = await visiblyExec(`npm`, [`run`, `build`], {
      cwd: join(path),
    });
    const createdLine = output.stdout.split('\n')
      .find(str => str.includes('created') && str.includes(jsFile));
    console.log(`-->`, createdLine || 'rollup completed weirdly!');
    console.log();
  }

  if (argv.only.includes('firebase')) {
    console.log(`--> Preparing fresh public directory`);
    const targetDir = join('firebase', 'public-generated');
    await visiblyExec('rm', ['-rf', targetDir]);
    // await visiblyExec('mkdir', [targetDir]);
    await visiblyExec('cp', ['-ra', join('firebase', 'public'), targetDir]);
    for (const app of resolvedApps) {
      const webTarget = join(targetDir, app.id);
      // await visiblyExec('rm', ['-rf', webTarget]);
      await visiblyExec('cp', ['-ra', join(app.directory, 'web'), webTarget]);
    }

    // js libraries
    const libDir = join(targetDir, '~~', 'lib');
    await visiblyExec('mkdir', ['-p', libDir]);
    await visiblyExec('cp', ['-ra',
      join(__dirname, '..', 'files', 'vendor-libs'),
      join(libDir, 'vendor')]);

    // copy all the dynamic libs in one command
    await visiblyExec('cp', ['-a',
      ...clientLibs,
      libDir+'/']);

    // install minified vuejs
    // TODO: obtain the minified versions directly
    await visiblyExec('mv', [
      join(libDir, 'vendor', 'vue.min.js'),
      join(libDir, 'vendor', 'vue.js')]);
    await visiblyExec('mv', [
      join(libDir, 'vendor', 'vue-router.min.js'),
      join(libDir, 'vendor', 'vue-router.js')]);

    // fonts
    const fontDir = join(targetDir, '~~', 'fonts');
    await visiblyExec('mkdir', ['-p', fontDir]);
    await visiblyExec('cp', ['-ra',
      join(__dirname, '..', 'files', 'vendor-fonts'),
      join(fontDir, 'vendor')]);


    console.log(`==> ${chalk.magenta.bold('Deploying')} to Firebase Hosting...`);
    const args = ['deploy', '--only', 'hosting', '--public', 'public-generated'];
    const fireDeploy = await visiblyExec(`firebase`, args, {
      cwd: join(process.cwd(), 'firebase'),
    });

    // console.log(`    ${chalk.gray.bold('firebase')} ${chalk.gray(args.join(' '))}`);
    // const fireProc = execa('firebase', args, {
    //   // buffer: false,
    //   stdio: 'inherit',
    //   cwd: join(process.cwd(), 'firebase'),
    // });
    // try {
    //   await fireProc;
    // } catch (err) {
    //   console.log(`!-> Firebase deploy crashed w/ exit code ${err.code}`)
    //   process.exit(5);
    // }

    await visiblyExec('rm', ['-rf', targetDir]);
    if (fireDeploy.stdout.includes('release complete')) {
      console.log(`==> ${chalk.green.bold('Hosting looks good!')} Yay :)`);
    } else {
      console.log(`!-> Something's off with the firebase CLI, this is what I saw:`);
      console.log(fireDeploy.stdout);
      process.exit(5);
    }
    console.log();
  }

  if (argv.only.includes('backend')) {
    console.log(`--> Preparing backend kustomization`);
    const targetDir = (await visiblyExec(`mktemp`, ['-d'])).stdout;

    await visiblyExec('cp', [join(__dirname, '..', 'files', 'kustomize-skeletons', 'deployment.yaml'), targetDir]);
    await visiblyExec('cp', [join(__dirname, '..', 'files', 'kustomize-skeletons', 'service.yaml'), targetDir]);

    const {
      kubernetes, allowed_origins, domain, env,
    } = projectConfig.backend_deployment;

    await writeFile(join(targetDir, 'ingress.yaml'), yaml.safeDump(Kubernetes.generateIngress({
      serviceName: 'api',
      annotations: kubernetes.ingressAnnotations,
      domains: [domain],
    })));

    const {
      project_id, database_url, admin_uids,
    } = projectConfig.authority.firebase;

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
        files: resolvedApps.map(app => `${app.id}.mjs=schemas/${app.id}.mjs`),
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
    await visiblyExec('mkdir', [join(targetDir, 'schemas')]);
    for (const app of resolvedApps) {
      const target = join(targetDir, 'schemas', `${app.id}.mjs`);
      await visiblyExec('cp', [join(app.directory, 'schema.mjs'), target]);
    }

    const {extraSchemasDir} = projectConfig;
    if (extraSchemasDir) {
      for (const schemaFile of await fs.readdir(extraSchemasDir)) {
        const target = join(targetDir, 'schemas', schemaFile);
        await visiblyExec('cp', [join(extraSchemasDir, schemaFile), target]);
      }
    }

    try {
      console.log(`    Adding secrets`);
      await visiblyExec('cp', [join(configDir, 'firebase-service-account.json'), targetDir]);
      await writeFile(join(targetDir, 'api.env'), Object.keys(env).map(key => `${key}=${env[key]}`).join(`\n`)+`\n`);

      // const kustomized = await visiblyExec('kustomize', ['build', targetDir]);
      // console.log(kustomized.stdout);
      console.log(`==> ${chalk.magenta.bold('Deploying')} to Kubernetes...`);
      const kustomized = await visiblyExecWithSpecificRetry('kubectl', ['--context='+kubernetes.context, 'apply', '-k', targetDir]);
    } finally {
      await visiblyExec('rm', ['-rf', targetDir]);
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
}

async function writeFile(path, contents) {
  console.log(`    ${chalk.gray.bold('cat')} ${chalk.gray(`> ${path}`)}`);
  await fs.writeFile(path, contents, 'utf-8');
}

async function visiblyExecWithSpecificRetry(...stuff) {
  try {
    return await visiblyExec(...stuff);
  } catch (err) {
    if (err.stderr && err.stderr.includes('context deadline exceeded')) {
      console.log('    control plane connection issue, retrying once');
      return await visiblyExec(...stuff);
    }
    throw err;
  }
}

async function visiblyExec(cmd, args, ...more) {
  await new Promise(r => process.stdout.write(
    `    ${chalk.gray.bold(cmd)} ${chalk.gray(args.join(' '))}`, r));
  try {
    return await execa(cmd, args, ...more);
  } finally {
    process.stdout.write(`\n`);
  }
  // if (result.exitCode !== 0) {
  //   console.log(chalk.red(`!-> ${args[0]} exited with ${result.exitCode}!!`));
  //   throw new Error(`Unexpected exit code ${result.exitCode} from ${JSON.stringify(args)}`);
  // }
}
