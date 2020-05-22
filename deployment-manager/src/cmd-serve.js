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
  .default('only', ['firebase', 'kubernetes'])
  .default('deployments-dir', DUSTJS_DEPLOYMENTS_DIR)
  .default('dustjs-path', '/home/dan/Code/@stardustapp/dustjs')
  .default('apps-path', DUSTJS_APPS_PATH)
;

exports.handler = async argv => {
  const runner = new Runner();

  console.log();
  const {
    configDir,
    projectConfig,
    resolvedApps,
  } = await Loader.loadProjectConfig(process.cwd(), argv);
  console.log();

  let clientLibs = new Array;
  if (argv.only.includes('client-library')) {
    console.log(`==> Preparing @dustjs/client livecompile`);
    const path = join(argv['dustjs-path'], 'client');
    const jsFile = 'dustjs-client.umd.js';
    clientLibs.push(join(path, 'dist', jsFile));
    clientLibs.push(join(path, 'dist', jsFile+'.map'));

    const clientBuild = runner.launchBackgroundProcess('npm', {
      args: ['run', 'dev'],
      cwd: join(path),
    });
    await clientBuild.perLine((line, resolve) => {
      // TODO: 'waiting for changes' only logged when in pty
      if (line.includes('waiting for changes')) {
        resolve(true);
      } else if (line.includes('created') && line.includes(jsFile)) {
        console.log(`   `, chalk.magenta('rollup:'), line);
        resolve(line);
      } else if (line.includes('!')) {
        if (argv['send-notifs'] && line.includes('[!]')) {
          execa('notify-send', ['-a', 'dust-deployer serve', 'rollup build error', line]);
        }
        console.log(`   `, chalk.magenta('rollup:'), line);
      }
    });
    console.log(`-->`, `Compiled @dustjs/client`);
    console.log();
  }

  if (argv.only.includes('client-vue')) {
    console.log(`==> Preparing @dustjs/client-vue livecompile`);
    const path = join(argv['dustjs-path'], 'client-vue');
    const jsFile = 'dustjs-client-vue.umd.js';
    clientLibs.push(join(path, 'dist', jsFile));
    clientLibs.push(join(path, 'dist', jsFile+'.map'));
    const cssFile = 'dustjs-client-vue.css';
    clientLibs.push(join(path, 'dist', cssFile));

    const clientBuild = runner.launchBackgroundProcess('npm', {
      args: ['run', 'dev'],
      cwd: join(path),
    });
    await clientBuild.perLine((line, resolve) => {
      // TODO: 'waiting for changes' only logged when in pty
      if (line.includes('waiting for changes')) {
        resolve(true);
      } else if (line.includes('created') && line.includes(jsFile)) {
        console.log(`   `, chalk.magenta('rollup:'), line);
        resolve(line);
      } else if (line.includes('!')) {
        if (argv['send-notifs'] && line.includes('[!]')) {
          execa('notify-send', ['-a', 'dust-deployer serve', 'rollup build error', line]);
        }
        console.log(`   `, chalk.magenta('rollup:'), line);
      }
    });
    console.log(`-->`, `Compiled @dustjs/client-vue`);
    console.log();
  }

  if (argv.only.includes('firebase')) {
    console.log(`--> Preparing live public directory`);

    const targetDir = join('firebase', 'public-linked');
    await runner.execUtility('rm', ['-rf', targetDir]);
    await runner.execUtility('mkdir', [targetDir]);
    runner.tempDirs.push(targetDir);

    // what we can do of manual public/
    const publicDir = join('firebase', 'public');
    for (const file of await fs.readdir(publicDir)) {
      await runner.execUtility(`ln`, [`-s`,
        join('..', 'public', file),
        join(targetDir, file)]);
    }

    // the apps
    for (const app of resolvedApps) {
      await runner.execUtility('ln', ['-s',
        join(app.directory, 'web'),
        join(targetDir, app.id)]);
    }

    // js libraries
    const libDir = join(targetDir, '~~', 'lib');
    await runner.execUtility('mkdir', ['-p', libDir]);
    await runner.execUtility('ln', ['-s',
      join(__dirname, '..', 'files', 'vendor-libs'),
      join(libDir, 'vendor')]);

    // link all the dynamic libs in one command
    await runner.execUtility('ln', ['-s',
      ...clientLibs,
      libDir+'/']);

    // fonts
    const fontDir = join(targetDir, '~~', 'fonts');
    await runner.execUtility('mkdir', ['-p', fontDir]);
    await runner.execUtility('ln', ['-s',
      join(__dirname, '..', 'files', 'vendor-fonts'),
      join(fontDir, 'vendor')]);

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

  if (argv.only.includes('backend')) {
    const targetDir = await runner.createTempDir();
    const backendDir = join(argv['dustjs-path'], 'backend-firebase');

    console.log(`--> Preparing backend schemas`);
    await runner.execUtility('mkdir', [join(targetDir, 'schemas')]);
    for (const app of resolvedApps) {
      await runner.execUtility('ln', ['-s',
        join(app.directory, 'schema.mjs'),
        join(targetDir, 'schemas', `${app.id}.mjs`)]);
    }
    const {extraSchemasDir} = projectConfig;
    if (extraSchemasDir) {
      for (const schemaFile of await fs.readdir(extraSchemasDir)) {
        await runner.execUtility('ln', ['-s',
          join(process.cwd(), extraSchemasDir, schemaFile),
          join(targetDir, 'schemas', schemaFile)]);
      }
    }

    const {
      project_id, database_url, admin_uids,
    } = projectConfig.authority.firebase;

    console.log(`==> Starting Backend...`);
    const backendProc = runner.launchBackgroundProcess('node', {
      args: ['--unhandled-rejections=strict', '.'],
      cwd: backendDir,
      env: {
        'FIREBASE_PROJECT_ID': project_id,
        'FIREBASE_DATABASE_URL': database_url,
        'FIREBASE_ADMIN_UIDS': (admin_uids||[]).join(','),
        'SKYLINK_ALLOWED_ORIGINS': 'http://localhost:5000', // allowed_origins.join(','),
        'GOOGLE_APPLICATION_CREDENTIALS': join(configDir, 'firebase-service-account.json'),
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
}
