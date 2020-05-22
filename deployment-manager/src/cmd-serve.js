const fs = require('fs').promises;
const {join} = require('path');

const yaml = require('js-yaml');
const chalk = require('chalk');
const execa = require('execa');

const Loader = require('./loader.js');

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

class ServiceRunner {
  constructor() {
    this.processes = new Array;
    this.tempDirs = new Array;
    this.shuttingDown = false;
  }
  addProcess(process) {
    this.processes.push(process);
    process.then(() => {
      if (this.shuttingDown) return;
      console.log('Process ended:', process.exitCode);
    }, err => {
      if (err.isCanceled) return;
      // TODO: err bools: failed, timedOut, killed
      console.log('Process crashed:', err.exitCode);
      console.log('Process:', err.command);
    });
  }
  async shutdown() {
    this.shuttingDown = true;
    const processPromises = this.processes
      .map(p => p.catch(() => {}));

    for (const process of this.processes) {
      console.log('   ', chalk.gray.bold('kill'), chalk.gray(process.pid));
      process.cancel();
    }
    await Promise.all(processPromises);

    for (const dir of this.tempDirs) {
      await visiblyExec('rm', ['-r', dir]);
    }
  }
}

exports.handler = async argv => {
  console.log();
  const {
    configDir,
    projectConfig,
    resolvedApps,
  } = await Loader.loadProjectConfig(process.cwd(), argv);
  console.log();

  const runner = new ServiceRunner();

  let clientLibs = new Array;
  if (argv.only.includes('client-library')) {
    console.log(`==> Preparing @dustjs/client livecompile`);
    const path = join(argv['dustjs-path'], 'client');
    const jsFile = 'dustjs-client.umd.js';
    clientLibs.push(join(path, 'dist', jsFile));
    clientLibs.push(join(path, 'dist', jsFile+'.map'));

    const args = ['run', 'dev'];
    console.log(`    ${chalk.gray.bold('npm')} ${chalk.gray(args.join(' '))}`);
    const clientBuild = execa(`npm`, args, {
      cwd: join(path),
      all: true,
      buffer: false,
    });
    runner.addProcess(clientBuild);

    await new Promise((resolve, reject) => {
      clientBuild.all.once('end', () => resolve(null));
      clientBuild.all.on('data', async chunk => {
        for (const str of chunk.toString('utf-8').trim().split(`\n`)) {
          // TODO: 'waiting for changes' only logged when in pty
          if (str.includes('waiting for changes')) {
            resolve(true);
          } else if (str.includes('created') && str.includes(jsFile)) {
            console.log(`   `, chalk.magenta('rollup:'), str);
            resolve(str);
          } else if (str.includes('!')) {
            if (argv['send-notifs'] && str.includes('[!]')) {
              await execa('notify-send', ['-a', 'dust-deployer serve', 'rollup build error', str]);
            }
            console.log(`   `, chalk.magenta('rollup:'), str);
          }
        }
      });
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

    const args = ['run', 'dev'];
    console.log(`    ${chalk.gray.bold('npm')} ${chalk.gray(args.join(' '))}`);
    const clientBuild = execa(`npm`, args, {
      cwd: join(path),
      all: true,
      buffer: false,
    });
    runner.addProcess(clientBuild);

    await new Promise((resolve, reject) => {
      clientBuild.all.once('end', () => resolve(null));
      clientBuild.all.on('data', async chunk => {
        for (const str of chunk.toString('utf-8').trim().split(`\n`)) {
          // TODO: 'waiting for changes' only logged when in pty
          if (str.includes('waiting for changes')) {
            resolve(true);
          } else if (str.includes('created') && str.includes(jsFile)) {
            console.log(`   `, chalk.magenta('rollup:'), str);
            resolve(str);
          } else if (str.includes('!')) {
            if (argv['send-notifs'] && str.includes('[!]')) {
              await execa('notify-send', ['-a', 'dust-deployer serve', 'rollup build error', str]);
            }
            console.log(`   `, chalk.magenta('rollup:'), str);
          }
        }
      });
    });
    console.log(`-->`, `Compiled @dustjs/client-vue`);
    console.log();
  }

  if (argv.only.includes('firebase')) {
    console.log(`--> Preparing live public directory`);

    const targetDir = join('firebase', 'public-linked');
    await visiblyExec('rm', ['-rf', targetDir]);
    await visiblyExec('mkdir', [targetDir]);
    runner.tempDirs.push(targetDir);

    // what we can do of manual public/
    const publicDir = join('firebase', 'public');
    for (const file of await fs.readdir(publicDir)) {
      await visiblyExec(`ln`, [`-s`,
        join('..', 'public', file),
        join(targetDir, file)]);
    }

    // the apps
    for (const app of resolvedApps) {
      await visiblyExec('ln', ['-s',
        join(app.directory, 'web'),
        join(targetDir, app.id)]);
    }

    // js libraries
    const libDir = join(targetDir, '~~', 'lib');
    await visiblyExec('mkdir', ['-p', libDir]);
    await visiblyExec('ln', ['-s',
      join(__dirname, '..', 'files', 'vendor-libs'),
      join(libDir, 'vendor')]);

    // link all the dynamic libs in one command
    await visiblyExec('ln', ['-s',
      ...clientLibs,
      libDir+'/']);

    // fonts
    const fontDir = join(targetDir, '~~', 'fonts');
    await visiblyExec('mkdir', ['-p', fontDir]);
    await visiblyExec('ln', ['-s',
      join(__dirname, '..', 'files', 'vendor-fonts'),
      join(fontDir, 'vendor')]);

    console.log(`==> Starting Firebase Hosting...`);
    const args = ['serve', '--only', 'hosting'];
    console.log(`    ${chalk.gray.bold('firebase')} ${chalk.gray(args.join(' '))}`);

    const fireDeploy = execa(`firebase`, args, {
      cwd: join(process.cwd(), 'firebase'),
      stderr: 'inherit',
      buffer: false,
    });
    runner.addProcess(fireDeploy);

    const url = await new Promise((resolve, reject) => {
      fireDeploy.stdout.once('end', () => resolve(null));
      fireDeploy.stdout.on('data', chunk => {
        const str = chunk.toString('utf-8');
        const match = str.match(/"([A-Z]+) ([^ ]+) (HTTP\/[0-9.]+)" ([0-9-]+) ([0-9-]+) "/);
        if (str.includes('Local server:')) {
          resolve(str.match(/http[:\/a-z0-9\[\]-]+/i)[0]);
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
    });
    console.log(`-->`, `Firebase serving at`, chalk.bold(url));
    console.log();
  }

  if (argv.only.includes('backend')) {
    const targetDir = (await visiblyExec(`mktemp`, ['-d'])).stdout;
    const backendDir = join(argv['dustjs-path'], 'backend-firebase');

    console.log(`--> Preparing backend schemas`);
    await visiblyExec('mkdir', [join(targetDir, 'schemas')]);
    for (const app of resolvedApps) {
      await visiblyExec('ln', ['-s',
        join(app.directory, 'schema.mjs'),
        join(targetDir, 'schemas', `${app.id}.mjs`)]);
    }
    const {extraSchemasDir} = projectConfig;
    if (extraSchemasDir) {
      for (const schemaFile of await fs.readdir(extraSchemasDir)) {
        await visiblyExec('ln', ['-s',
          join(process.cwd(), extraSchemasDir, schemaFile),
          join(targetDir, 'schemas', schemaFile)]);
      }
    }

    const {
      project_id, database_url, admin_uids,
    } = projectConfig.authority.firebase;

    console.log(`==> Starting Backend...`);
    const args = ['--unhandled-rejections=strict', '.'];
    const env = {
      'FIREBASE_PROJECT_ID': project_id,
      'FIREBASE_DATABASE_URL': database_url,
      'FIREBASE_ADMIN_UIDS': (admin_uids||[]).join(','),
      'SKYLINK_ALLOWED_ORIGINS': 'http://localhost:5000', // allowed_origins.join(','),
      'GOOGLE_APPLICATION_CREDENTIALS': join(configDir, 'firebase-service-account.json'),
      'DUSTJS_SCHEMA_PATH': join(targetDir, 'schemas')+'/',
    };
    console.log(`    ${chalk.gray.bold('node')} ${chalk.gray(args.join(' '))}`);

    const backendProc = execa(`node`, args, {
      cwd: backendDir,
      env,
      stderr: 'inherit',
      buffer: false,
    });
    runner.addProcess(backendProc);

    await new Promise((resolve, reject) => {
      backendProc.stdout.once('end', () => reject(new Error(
        `Backend process exited.`)));
      backendProc.stdout.on('data', async chunk => {
        for (const str of chunk.toString('utf-8').trim().split(`\n`)) {
          // TODO: 'waiting for changes' only logged when in pty
          if (str.includes('App listening on')) {
            resolve(true);
          }
          if (!str.startsWith('--> inbound operation')) {
            console.log(`   `, chalk.magenta('backend:'), str);
          }
        }
      });
    });
    console.log(`-->`, `Backend is ready to go.`);
    console.log();
  }

  process.once('SIGINT', async function() {
    console.log();
    console.log('--> Interrupted, cleaning up...');
    await runner.shutdown();
    console.log('    Caio!');
    console.log();
  });

}

async function visiblyExec(cmd, args, ...more) {
  await new Promise(r => process.stdout.write(
    `    ${chalk.gray.bold(cmd)} ${chalk.gray(args.join(' '))}`, r));
  try {
    return await execa(cmd, args, ...more);
  } finally {
    process.stdout.write(`\n`);
  }
}
