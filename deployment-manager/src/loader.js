const fs = require('fs').promises;
const {join} = require('path');

const yaml = require('js-yaml');
const chalk = require('chalk');

const envPaths = require('env-paths')
  ('dust-deployer', {suffix: ''});

const Runner = require('./runner.js');

class DustProject {
  constructor(loader, {
    configDir, deploymentConfig, projectConfig, resolvedApps,
  }) {
    this.loader = loader;
    this.configDir = configDir;
    this.deploymentConfig = deploymentConfig;
    this.projectConfig = projectConfig;
    this.resolvedApps = resolvedApps;

    this.libraryDirs = new Map;
  }

  async fetchMissingPackages() {
    const cacheDir = join(envPaths.cache, 'libraries');
    Runner.registerKnownDir(cacheDir, '$LibCache');

    // check for all libraries in our cache in parallel
    // a bit convoluted since filter doesn't work w/ async
    const missingLibs = (await Promise.all((this
      .projectConfig.hosted_libraries || [])
      .map(lib => fs
        .access(join(cacheDir,
          lib.npm_module, lib.min_version))
        .then(() => {
          this.libraryDirs.set(lib, join(cacheDir,
            lib.npm_module, lib.min_version));
          return false;
        }, err => {
           // return lib config when not found in cache
          if (err.code === 'ENOENT') return lib;
          throw err;
        }))))
      .filter(x => x);
    if (missingLibs.length === 0) {
      console.log('-->', `All libraries are already cached`);
      return;
    }

    console.log('==>', `Downloading missing libraries from NPM`);
    const runner = new Runner();
    await runner.createTempDir({andSwitch: true});

    for (const lib of missingLibs) {
      const libSpecifier = `${lib.npm_module}@${lib.min_version}`;
      const packProc = await runner
        .execUtility('npm', ['pack', libSpecifier]);

      const libTarget = join(cacheDir,
        lib.npm_module, lib.min_version);
      await runner.execUtility(`mkdir`, [`-p`, libTarget]);
      this.libraryDirs.set(lib, libTarget);

      const tgzName = packProc.stdout;
      await runner.execUtility('tar', [
        '-xf', tgzName,
        '-C', libTarget,
        '--strip-components', '1',
      ]);
    }
    // npm show --json @dustjs/client@latest versions
    // npm show @dustjs/client@0.1.0 dist.tarball

    await runner.shutdown();
    // throw new Error(`TODO`);
  }
}

class Loader {
  constructor(workdir) {
    this.workdir = workdir;
  }

  async tryDiscoverApp(config, appDir) {
    const schemaPath = join(appDir, 'schema.mjs');
    const schemaExists = await fs.access(schemaPath)
      .then(() => true, () => false);
    if (schemaExists) {
      console.log('    Found', chalk.bold(config.id), 'at', chalk.green(appDir));

      const appConfigPath = join(appDir, 'dust-project.yaml');
      const appConfig = await fs.readFile(appConfigPath, 'utf-8')
        .then(x => yaml.safeLoad(x), err => ({}));

      return { ...config, appConfig, directory: appDir };
    }
  }

  async loadProjectConfig(argv) {
    console.log('==> Loading deployment configuration...');
    const projectConfig = yaml.safeLoad(await fs.readFile(join(this.workdir, 'dust-project.yaml'), 'utf-8'));

    const rcData = await fs.readFile(join(this.workdir, 'firebase', '.firebaserc'), 'utf-8');
    const firebaseRc = JSON.parse(rcData);
    const firebaseProject = firebaseRc.projects.default;
    // console.log(firebaseRc);

    const appsDirs = argv.appsPath.split(':');

    const deploymentDir = join(argv.deploymentsDir, firebaseProject);
    const deploymentConfig = yaml.safeLoad(await fs.readFile(join(deploymentDir, 'config.yaml'), 'utf-8'));
    // console.log(deploymentConfig);

    console.log('--> Discovering applications...');
    const apps = await Promise.all(projectConfig.apps.map(async app => {
      if (typeof app.id !== 'string' || app.id.includes('/')) throw new Error(
        `Invalid app ID ${JSON.stringify(app.id)}`);

      switch (true) {
        case 'standard' in app:
          for (const appsDir of appsDirs) {
            const appDir = join(appsDir, app.standard);
            const discovery = await this.tryDiscoverApp(app, appDir);
            if (discovery) return discovery;
          }
        case 'source' in app:
          const appDir = join(this.workdir, app.source);
          const discovery = await this.tryDiscoverApp(app, appDir);
          if (discovery) return discovery;
      }
      throw new Error(`Failed to find app for ${JSON.stringify(app)}`);
    }));
    console.log('--> Located all', chalk.yellow(apps.length), 'applications :)');

    return new DustProject(this, {
      configDir: deploymentDir,
      deploymentConfig,
      projectConfig,
      resolvedApps: apps,
    });
  }
}
module.exports = Loader;
