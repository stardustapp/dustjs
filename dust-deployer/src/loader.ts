import * as YAML from 'https://deno.land/std@0.78.0/encoding/yaml.ts';
import * as clr from 'https://deno.land/std@0.78.0/fmt/colors.ts';
import { join } from 'https://deno.land/std@0.78.0/path/mod.ts';

import {ServiceRunner} from './runner.ts';

import EnvPaths from "./env_paths.ts";
import { DustDeployment, DustProject, ProjectApp } from "./dust-config.ts";
const envPaths = EnvPaths
  ('dust-deployer', {suffix: ''});

export class Project {
  loader: Loader;
  configDir: string;
  deploymentConfig: DustDeployment;
  projectConfig: DustProject;
  resolvedApps: DiscoveredApp[];
  libraryDirs = new Map();

  constructor(loader: Loader, config: {
    configDir: string;
    deploymentConfig: DustDeployment;
    projectConfig: DustProject;
    resolvedApps: DiscoveredApp[];
  }) {
    this.loader = loader;
    this.configDir = config.configDir;
    this.deploymentConfig = config.deploymentConfig;
    this.projectConfig = config.projectConfig;
    this.resolvedApps = config.resolvedApps;
  }

  async fetchMissingPackages() {
    const cacheDir = join(envPaths.cache, 'libraries');
    ServiceRunner.registerKnownDir(cacheDir, '$LibCache');

    // check for all libraries in our cache in parallel
    // a bit convoluted since filter doesn't work w/ async
    const missingLibs = (await Promise.all((this
      .projectConfig.hosted_libraries || [])
      .map(lib => lib.source
        ? (this.libraryDirs.set(lib, lib.source), false)
        : Deno
          .stat(join(cacheDir,
            lib.npm_module, lib.min_version ?? 'todo'))
          .then(() => {
            this.libraryDirs.set(lib, join(cacheDir,
              lib.npm_module, lib.min_version ?? 'todo'));
            return false;
          }, err => {
            // return lib config when not found in cache
            // TODO: not node...
            if (err.code === 'ENOENT') return lib;
            throw err;
          }))))
      .filter(x => x);
    if (missingLibs.length === 0) {
      console.log('-->', `All libraries are already cached`);
      return;
    }

    console.log('==>', `Downloading missing libraries from NPM`);
    const runner = new ServiceRunner();
    await runner.createTempDir({andSwitch: true});

    for (const lib of missingLibs) {
      if (typeof lib === 'boolean') continue;
      const libSpecifier = `${lib.npm_module}@${lib.min_version}`;
      const packProc = await runner
        .execUtility('npm', ['pack', libSpecifier]);

      const libTarget = join(cacheDir,
        lib.npm_module, lib.min_version ?? 'todo');
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

interface DiscoveredApp extends ProjectApp {
  appConfig: DustProject;
  directory: string;
};

export class Loader {
  workdir: string;
  constructor(workdir: string) {
    this.workdir = workdir;
  }

  async tryDiscoverApp(config: ProjectApp, appDir: string): Promise<DiscoveredApp | undefined> {
    try {
      await Deno.stat(join(appDir, 'schema.mjs'));
      console.log('    Found', clr.bold(config.id), 'at', clr.green(appDir));

      const appConfigPath = join(appDir, 'dust-project.yaml');
      const appConfig = YAML.parse(await Deno.readTextFile(appConfigPath)) as DustProject;
      return { ...config, appConfig, directory: appDir };

    } catch (err) {
      console.log('    Ignoring', config.id, 'due to', err.stack.split('\n')[0]);
    }
  }

  async loadProjectConfig(argv: {appsPath: string; deploymentsDir: string}) {
    console.log('==> Loading deployment configuration...');
    const projectConfig = YAML.parse(await Deno.readTextFile(join(this.workdir, 'dust-project.yaml'))) as DustProject;

    const rcData = await Deno.readTextFile(join(this.workdir, 'firebase', '.firebaserc'));
    const firebaseRc = JSON.parse(rcData) as {projects: {default: string}};
    const firebaseProject = firebaseRc.projects.default;
    // console.log(firebaseRc);

    const appsDirs = argv.appsPath.split(':');

    const deploymentDir = join(argv.deploymentsDir, firebaseProject);
    const deploymentConfig = YAML.parse(await Deno.readTextFile(join(deploymentDir, 'config.yaml'))) as DustDeployment;
    // console.log(deploymentConfig);

    console.log('--> Discovering applications...');
    const apps = await Promise.all((projectConfig.apps ?? []).map(async app => {
      if (typeof app.id !== 'string' || app.id.includes('/')) throw new Error(
        `Invalid app ID ${JSON.stringify(app.id)}`);

      if (app.standard) {
        for (const appsDir of appsDirs) {
          const appDir = join(appsDir, app.standard);
          const discovery = await this.tryDiscoverApp(app, appDir);
          if (discovery) return discovery;
        }
      }
      if (app.source) {
        const appDir = join(this.workdir, app.source);
        const discovery = await this.tryDiscoverApp(app, appDir);
        if (discovery) return discovery;
      }
      throw new Error(`Failed to find app for ${JSON.stringify(app)}`);
    }));
    console.log('--> Located all', clr.yellow(apps.length.toString(10)), 'applications :)');

    return new Project(this, {
      configDir: deploymentDir,
      deploymentConfig,
      projectConfig,
      resolvedApps: apps,
    });
  }
}
