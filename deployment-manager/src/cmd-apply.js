const fs = require('fs').promises;
const {join} = require('path');

const yaml = require('js-yaml');
const chalk = require('chalk');
const execa = require('execa');

const {DUSTJS_DEPLOYMENTS_DIR, DUSTJS_APPS_PATH} = process.env;
// var doc = yaml.safeLoad(fs.readFileSync('/home/ixti/example.yml', 'utf8'));

exports.builder = yargs => yargs
  // .positional('port', {
  //   describe: 'port to bind on',
  //   default: 5000
  // })
  .array('only')
  .default('only', ['firebase', 'kubernetes'])
  .default('backend-image-tag', 'latest')
  .default('deployments-dir', DUSTJS_DEPLOYMENTS_DIR)
  .default('apps-path', DUSTJS_APPS_PATH)
;

exports.handler = async argv => {
  // console.log('input:', argv);
  console.log();
  console.log('==> Loading deployment configuration...');

  const rcData = await fs.readFile(join(process.cwd(), 'firebase', '.firebaserc'), 'utf-8');
  const firebaseRc = JSON.parse(rcData);
  const firebaseProject = firebaseRc.projects.default;
  // console.log(firebaseRc);

  const appsDirs = argv.appsPath.split(':');

  const deploymentDir = join(argv.deploymentsDir, firebaseProject);
  const deploymentConfig = yaml.safeLoad(await fs.readFile(join(deploymentDir, 'config.yaml'), 'utf-8'));
  // console.log(deploymentConfig);

  async function tryDiscoverApp(config, appDir) {
    const schemaPath = join(appDir, 'schema.mjs');
    const schemaExists = await fs.access(schemaPath)
      .then(() => true, () => false);
    if (schemaExists) {
      console.log('    Found', chalk.bold(config.id), 'at', chalk.green(appDir));
      return { ...config, directory: appDir };
    }
  }

  console.log('--> Discovering applications...');
  const apps = await Promise.all(deploymentConfig.apps.map(async app => {
    if (typeof app.id !== 'string' || app.id.includes('/')) throw new Error(
      `Invalid app ID ${JSON.stringify(app.id)}`);

    switch (true) {
      case 'standard' in app:
        for (const appsDir of appsDirs) {
          const appDir = join(appsDir, app.standard);
          const discovery = await tryDiscoverApp(app, appDir);
          if (discovery) return discovery;
        }
      case 'source' in app:
        const appDir = join(process.cwd(), app.source);
        const discovery = await tryDiscoverApp(app, appDir);
        if (discovery) return discovery;
    }
    throw new Error(`Failed to find app for ${JSON.stringify(app)}`);
  }));
  console.log('--> Located all', chalk.yellow(apps.length), 'applications :)');
  console.log();

  if (argv.only.includes('firebase')) {
    console.log(`--> Preparing fresh public directory`);
    const targetDir = join('firebase', 'public-generated');
    await visiblyExec('rm', ['-rf', targetDir]);
    // await visiblyExec('mkdir', [targetDir]);
    await visiblyExec('cp', ['-ra', join('firebase', 'public'), targetDir]);
    for (const app of apps) {
      const webTarget = join(targetDir, app.id);
      // await visiblyExec('rm', ['-rf', webTarget]);
      await visiblyExec('cp', ['-ra', join(app.directory, 'web'), webTarget]);
    }

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

  if (argv.only.includes('kubernetes')) {
    console.log(`--> Preparing backend kustomization`);
    const targetDir = (await visiblyExec(`mktemp`, ['-d'])).stdout;

    await visiblyExec('cp', [join(__dirname, '..', 'kustomize-skeletons', 'deployment.yaml'), targetDir]);
    await visiblyExec('cp', [join(__dirname, '..', 'kustomize-skeletons', 'service.yaml'), targetDir]);

    const {
      kubernetes, allowed_origins, domain, env,
    } = deploymentConfig.backend_deployment;

    await writeFile(join(targetDir, 'ingress.yaml'), yaml.safeDump({
      apiVersion: 'extensions/v1beta1',
      kind: 'Ingress',
      metadata: {
        name: 'api-fe',
        annotations: kubernetes.ingressAnnotations,
      },
      spec: {
        tls: [{
          hosts: [domain],
          secretName: 'api-tls',
        }],
        rules: [{
          host: domain,
          http: {
            paths: [{
              path: '/',
              backend: {
                serviceName: 'api',
                servicePort: 'http',
              }}]},
        }]}}));

      const {project_id, database_url, admin_uids} = deploymentConfig.authority.firebase;
      await writeFile(join(targetDir, 'deployment-patch.yaml'), yaml.safeDump({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'api' },
        spec: {
          replicas: kubernetes.replicas == null ? 1 : kubernetes.replicas,
          template: { spec: {
            containers: [{
              name: 'app',
              env: [
                { name: 'FIREBASE_PROJECT_ID', value: project_id },
                { name: 'FIREBASE_DATABASE_URL', value: database_url },
                { name: 'FIREBASE_ADMIN_UIDS', value: admin_uids.join(',') },
                { name: 'SKYLINK_ALLOWED_ORIGINS', value: allowed_origins.join(',') },
              ],
            }],
          }},
        }}));

    await writeFile(join(targetDir, 'kustomization.yaml'), yaml.safeDump({
      commonLabels: kubernetes.labels,
      namespace: kubernetes.namespace,
      namePrefix: `${firebaseProject}-`,
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
        files: apps.map(app => `${app.id}.mjs=schemas/${app.id}.mjs`),
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
    for (const app of apps) {
      const target = join(targetDir, 'schemas', `${app.id}.mjs`);
      await visiblyExec('cp', [join(app.directory, 'schema.mjs'), target]);
    }
    if (deploymentConfig.extraSchemasDir) {
      for (const schemaFile of await fs.readdir(extraSchemasDir)) {
        const target = join(targetDir, 'schemas', schemaFile);
        await visiblyExec('cp', [join(extraSchemasDir, schemaFile), target]);
      }
    }

    try {
      console.log(`    Adding secrets`);
      await visiblyExec('cp', [join(deploymentDir, 'firebase-service-account.json'), targetDir]);
      await writeFile(join(targetDir, 'api.env'), Object.keys(env).map(key => `${key}=${env[key]}`).join(`\n`)+`\n`);

      // const kustomized = await visiblyExec('kustomize', ['build', targetDir]);
      // console.log(kustomized.stdout);
      console.log(`==> ${chalk.magenta.bold('Deploying')} to Kubernetes...`);
      const kustomized = await visiblyExec('kubectl', ['--context='+kubernetes.context, 'apply', '-k', targetDir]);
    } finally {
      await visiblyExec('rm', ['-rf', targetDir]);
    }

    console.log(`--> Waiting for deployment to stabilize`);
    const labelStr = Object.keys(kubernetes.labels)
      .map(x => `${x}=${kubernetes.labels[x]}`)
      .join(',');

    const seenPods = new Map;
    while (true) {
      await new Promise(r => setTimeout(r, 5000));
      const {stdout} = await execa(`kubectl`, ['--context='+kubernetes.context, '-n', kubernetes.namespace, 'get', 'pods', '-l', labelStr]);
      const badLines = stdout.split(`\n`).filter(x => {
        if (x.startsWith('NAME')) return false;
        const [_, ready, total] = x.match(/ (\d+)\/(\d+) /);
        if (ready !== total) return true;
        if (!x.includes(' Running ')) return true;
        return false;
      });
      if (badLines.length === 0) {
        console.log(`==> ${chalk.green.bold('Backend looks good!')} Yay :)`);
        break;
      } else {
        for (const line of badLines) {
          const [name, ready, status, restarts, age] = line.split(/ +/);
          const healthStr = [ready,status,restarts].join(',');
          if (seenPods.get(name) === healthStr) continue;
          seenPods.set(name, healthStr);
          let statusStr = chalk[{
            Pending: 'cyan',
            ContainerCreating: 'cyan',
            Running: 'green',
            Terminating: 'yellow',
          }[status]||'red'](status);
          statusStr += ` (${ready} ready`;
          if (restarts !== '0') {
            statusStr += `, ${chalk.red(restarts+' restarts')}`;
          }
          statusStr += `, ${chalk.bold(age)} old)`;
          console.log('   ', chalk.cyan(name), 'is now', statusStr);
        }
      }
    }
    console.log();
  }
}

async function writeFile(path, contents) {
  console.log(`    ${chalk.gray.bold('cat')} ${chalk.gray(`> ${path}`)}`);
  await fs.writeFile(path, contents, 'utf-8');
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