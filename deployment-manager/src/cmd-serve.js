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
  .default('only', ['firebase', 'kubernetes'])
  .default('deployments-dir', DUSTJS_DEPLOYMENTS_DIR)
  .default('client-lib-dir', '/home/dan/Code/@stardustapp/dustjs/client')
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
    const path = argv['client-lib-dir'];
    const jsFile = 'dustjs-client.umd.js';
    clientLibs.push([
      join(path, 'dist', jsFile),
      jsFile,
    ]);
    clientLibs.push([
      join(path, 'dist', jsFile+'.map'),
      jsFile+'.map',
    ]);

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
    for (const lib of clientLibs) {
      await visiblyExec('ln', ['-s',
        lib[0],
        join(libDir, lib[1])]);
    }

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
          const statusColor = {'2': 'green', '3': 'cyan', '4': 'yellow', '5': 'red'}[status[0]] || 'cyan';
          console.log(`   `, chalk.blue(verb), chalk.cyan(path), chalk[statusColor](status));
        }
      });
    });
    console.log(`-->`, `Firebase serving at`, chalk.bold(url));
    console.log();
  }

  if (argv.only.includes('backend')) {
    console.log(`!-> TODO: Kubernetes serving`);

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
