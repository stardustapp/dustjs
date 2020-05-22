const chalk = require('chalk');
const execa = require('execa');

class ServiceRunner {
  constructor() {
    this.processes = new Array;
    this.tempDirs = new Array;
    this.shuttingDown = false;

    process.once('SIGINT', async () => {
      console.log();
      console.log('--> Interrupted, cleaning up...');
      await this.shutdown();
      console.log('    Caio!');
      console.log();
    });
  }

  async execUtility(cmd, args, opts={}) {
    if (opts.cwd) {
      console.log(`   `,
        chalk.gray.bold('cd'),
        chalk.gray(opts.cwd));
    }
    await new Promise(r => process.stdout.write(
      `    ${chalk.gray.bold(cmd)} ${chalk.gray(args.join(' '))}`, r));
    try {
      return await execa(cmd, args, opts);
    } finally {
      await new Promise(r => process.stdout.write(`\n`, r));
    }
  }

  async createTempDir() {
    await new Promise(r => process.stdout.write(
      `    ${chalk.gray.bold('mktemp')} ${chalk.gray(`-d`)}`, r));
    try {
      const {stdout} = await execa(`mktemp`, [`-d`]);
      this.tempDirs.push(stdout);
      await new Promise(r => process.stdout.write(chalk.blue(` # ${stdout}`), r));
      return stdout;
    } finally {
      await new Promise(r => process.stdout.write(`\n`, r));
    }
  }

  launchBackgroundProcess(name, {args=[], ...opts}) {
    if (opts.cwd) {
      console.log(`   `,
        chalk.gray.bold('cd'),
        chalk.gray(opts.cwd));
    }
    console.log(`   `,
      chalk.gray.bold(name),
      chalk.gray(args.join(' ')),
      chalk.gray.bold('&'));

    // actually launch the process
    const proc = execa(name, args, {
      all: true,
      buffer: false,
      ...opts,
    });
    this.addBackgroundProcess(proc);

    return {
      process: proc,
      // wire up a Promise so consumer can wait for a 'ready' line
      perLine: lineCb => new Promise((resolve, reject) => {
        proc.all.once('end', () => reject(null));
        proc.all.on('data', async chunk => {
          // TODO, probably: handle writes that aren't line-aligned
          for (const str of chunk.toString('utf-8').trim().split(`\n`)) {
            lineCb(str, resolve, reject);
          }
        });
      }),
    };
  }

  // add a process to the background list
  // these will be monitored and also stopped when we want to exit
  addBackgroundProcess(process) {
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
      await this.execUtility('rm', ['-r', dir]);
    }
  }

}
module.exports = ServiceRunner;
