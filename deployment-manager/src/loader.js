const fs = require('fs').promises;
const {join} = require('path');

const yaml = require('js-yaml');
const chalk = require('chalk');

async function tryDiscoverApp(config, appDir) {
  const schemaPath = join(appDir, 'schema.mjs');
  const schemaExists = await fs.access(schemaPath)
    .then(() => true, () => false);
  if (schemaExists) {
    console.log('    Found', chalk.bold(config.id), 'at', chalk.green(appDir));
    return { ...config, directory: appDir };
  }
}

exports.loadProjectConfig = async function(workdir, argv) {
  console.log('==> Loading deployment configuration...');

  const rcData = await fs.readFile(join(workdir, 'firebase', '.firebaserc'), 'utf-8');
  const firebaseRc = JSON.parse(rcData);
  const firebaseProject = firebaseRc.projects.default;
  // console.log(firebaseRc);

  const appsDirs = argv.appsPath.split(':');

  const deploymentDir = join(argv.deploymentsDir, firebaseProject);
  const deploymentConfig = yaml.safeLoad(await fs.readFile(join(deploymentDir, 'config.yaml'), 'utf-8'));
  // console.log(deploymentConfig);

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
        const appDir = join(workdir, app.source);
        const discovery = await tryDiscoverApp(app, appDir);
        if (discovery) return discovery;
    }
    throw new Error(`Failed to find app for ${JSON.stringify(app)}`);
  }));
  console.log('--> Located all', chalk.yellow(apps.length), 'applications :)');

  return {
    configDir: deploymentDir,
    projectConfig: deploymentConfig,
    resolvedApps: apps,
  };
}
