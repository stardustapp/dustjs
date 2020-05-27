const fs = require('fs').promises;
const {join} = require('path');

const yaml = require('js-yaml');
const chalk = require('chalk');
const execa = require('execa');

const Loader = require('./loader.js');
const Runner = require('./runner.js');

const {DUSTJS_DEPLOYMENTS_DIR, DUSTJS_APPS_PATH} = process.env;

exports.builder = yargs => yargs
  // .positional('port', {
  //   describe: 'port to bind on',
  //   default: 5000
  // })
  .array('only')
  .boolean('send-notifs')
  .default('send-notifs', false)
  .default('only', ['firebase', 'backend'])
  .default('deployments-dir', DUSTJS_DEPLOYMENTS_DIR)
  .default('dustjs-path', '/home/dan/Code/@stardustapp/dustjs')
  .default('apps-path', DUSTJS_APPS_PATH)
;

exports.handler = async argv => {
  const loader = new Loader(process.cwd());
  const runner = new Runner();

  console.log();
  const project = await loader.loadProjectConfig(argv);
  await project.fetchMissingPackages();
  console.log();

  if (argv.only.includes('firebase') && argv['dustjs-path']) {
    console.log(`==>`, `Checking for local @dustjs modules to build directly`);
    Runner.registerKnownDir(argv['dustjs-path'], '$DustJsCheckout');

    for (const [library, _] of project.libraryDirs) {
      if (!library.npm_module.startsWith('@dustjs/')) continue;

      const baseName = library.npm_module.split('/')[1];
      const srcPath = join(argv['dustjs-path'], baseName)
      const exists = await fs.access(join(srcPath, 'package.json'))
        .then(() => true, () => false);
      if (!exists) {
        console.log('!-> Skipping local library', library.npm_module, `because it wasn't found at`, srcPath);
        continue;
      }

      console.log(`--> Starting ${library.npm_module} live-compile from local checkout`);
      const libBuild = runner.launchBackgroundProcess('npm', {
        args: ['run', 'dev'],
        cwd: srcPath,
      });
      await libBuild.perLine((line, resolve) => {
        // TODO: 'waiting for changes' only logged when in pty
        if (line.includes('waiting for changes')) {
          resolve(true);
        } else if (line.includes('created') && line.includes('.umd.js')) {
          console.log(`   `, chalk.magenta('rollup:'), line);
          resolve(line);
        } else if (line.includes('!')) {
          if (argv['send-notifs'] && line.includes('[!]')) {
            execa('notify-send', ['-a', 'dust-deployer serve', 'rollup build error', line]);
          }
          console.log(`   `, chalk.magenta('rollup:'), line);
        }
      });
      project.libraryDirs.set(library, srcPath);
    }
    console.log();
  }

  if (argv.only.includes('backend')) {
    const targetDir = await runner.createTempDir();
    const backendDir = join(argv['dustjs-path'], 'backend-firebase');

    console.log(`--> Preparing backend schemas`);
    await runner.execUtility('mkdir', [join(targetDir, 'schemas')]);
    for (const app of project.resolvedApps) {
      await runner.execUtility('ln', ['-s',
        join(app.directory, 'schema.mjs'),
        join(targetDir, 'schemas', `${app.id}.mjs`)]);
    }
    const {extraSchemasDir} = project.projectConfig;
    if (extraSchemasDir) {
      for (const schemaFile of await fs.readdir(extraSchemasDir)) {
        await runner.execUtility('ln', ['-s',
          join(process.cwd(), extraSchemasDir, schemaFile),
          join(targetDir, 'schemas', schemaFile)]);
      }
    }

    const {
      project_id, database_url, admin_uids,
    } = project.deploymentConfig.authority.firebase;

    console.log(`==> Starting Backend...`);
    const backendProc = runner.launchBackgroundProcess('node', {
      args: ['--unhandled-rejections=strict', '.'],
      cwd: backendDir,
      env: {
        'FIREBASE_PROJECT_ID': project_id,
        'FIREBASE_DATABASE_URL': database_url,
        'FIREBASE_ADMIN_UIDS': (admin_uids||[]).join(','),
        'SKYLINK_ALLOWED_ORIGINS': 'http://localhost:5000', // allowed_origins.join(','),
        'GOOGLE_APPLICATION_CREDENTIALS': join(project.configDir, 'firebase-service-account.json'),
        'DUSTJS_SCHEMA_PATH': join(targetDir, 'schemas')+'/',
      },
    });

    await backendProc.perLine((line, resolve) => {
      if (line.includes('App listening on')) {
        resolve(true);
      }
      if (!line.startsWith('--> inbound operation')) {
        console.log(`   `, chalk.magenta('backend:'), line);
      }
    });
    console.log(`-->`, `Backend is ready to go.`);
    console.log();
  }

  if (argv.only.includes('firebase')) {
    console.log(`--> Preparing live public directory`);

    const targetDir = join('firebase', 'public-linked');
    Runner.registerKnownDir(targetDir, '$WebTarget');
    await runner.execUtility('rm', ['-rf', targetDir]);
    await runner.execUtility('mkdir', [targetDir]);
    runner.addTempDir(targetDir);

    // what we can do of manual public/
    const publicDir = join('firebase', 'public');
    for (const file of await fs.readdir(publicDir)) {
      await runner.execUtility(`ln`, [`-s`,
        join('..', 'public', file),
        join(targetDir, file)]);
    }

    // the apps
    for (const app of project.resolvedApps) {
      const webBundle = (app.appConfig.bundles || [])
        .find(x => x.type === 'static html');
      if (!webBundle) {
        console.log('!-> WARN: App', app.id, 'lacks a static HTML bundle');
        continue;
      }

      await runner.execUtility('ln', ['-s',
        join(app.directory, webBundle.source),
        join(targetDir, app.id)]);
    }

    // js libraries
    const libDir = join(targetDir, '~~', 'lib');
    await runner.execUtility('mkdir', ['-p', libDir]);
    for (const lib of project.projectConfig.hosted_libraries || []) {
      const cacheDir = project.libraryDirs.get(lib);
      if (!cacheDir) throw new Error(
        `BUG: ${lib.npm_module} wasn't found locally`);
      await runner.execUtility('ln', ['-s',
        join(cacheDir, lib.sub_path||''),
        join(libDir, lib.npm_module.replace('/', '-'))]);
    }

    console.log(`==> Starting Firebase Hosting...`);
    const fireServe = runner.launchBackgroundProcess('firebase', {
      args: ['serve', '--only', 'hosting'],
      cwd: join(process.cwd(), 'firebase'),
    });
    const url = await fireServe.perLine((line, resolve) => {
      const match = line.match(/"([A-Z]+) ([^ ]+) (HTTP\/[0-9.]+)" ([0-9-]+) ([0-9-]+) "/);
      if (line.includes('Local server:')) {
        resolve(line.match(/http[:\/a-z0-9\[\]-]+/i)[0]);
      } else if (match) {
        const [_, verb, path, proto, status, size] = match;
        if (status === '200' && (path.startsWith('/~~') ||  path.startsWith('/__'))) {
          console.log(`   `, chalk.magenta('firebase:'), chalk.gray(`${verb} ${path} ${status}`));
        } else {
          const statusColor = {'2': 'green', '3': 'cyan', '4': 'yellow', '5': 'red'}[status[0]] || 'cyan';
          const extraFmt = (parseInt(status) >= 300) ? 'bold' : statusColor;
          console.log(`   `, chalk.magenta('firebase:'), chalk.blue(verb), chalk.cyan(path), chalk[statusColor][extraFmt](status));
        }
      }
    });
    console.log(`-->`, `Firebase serving at`, chalk.bold(url));
    console.log();
  }

}
