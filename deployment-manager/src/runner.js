const chalk = require('chalk');
const execa = require('execa');
const process = require('process');

const KnownDirs = new Array;

// TODO: execa uses a comprehensive lib for cleanup, but it's not async-friendly. so we do a best effort with temp dirs until it makes sense to add sync cleanup.
const cleaningUp = new Promise(resolve => {
  function catchSignal() {
    process.off('SIGINT', resolve);
    resolve();
  }
  process.on('SIGINT', resolve);
});

class ServiceRunner {
  constructor(cwd) {
    this.cwd = cwd || process.cwd();

    this.processes = new Array;
    this.tempDirs = new Array;
    this.shuttingDown = false;

    cleaningUp.then(this.onInterrupt);
  }
  setDefaultWorkDir(workDir) {
    console.log(`   `,
      chalk.gray.bold('cd'),
      chalk.gray(this.formatArgs([workDir])));
    this.cwd = workDir;
  }
  static registerKnownDir(prefix, variable) {
    console.log(`   `,
      chalk.blue(variable.slice(1))
      +chalk.gray('='+prefix));
    KnownDirs.push([prefix, variable]);
  }
  addTempDir(tempDir) {
    this.tempDirs.push(tempDir);
  }
  formatArgs(args) {
    return args.map(arg => {
      const knownDir = KnownDirs
        .find(([prefix]) => arg.startsWith(prefix));
      if (knownDir) {
        arg = chalk.blue(knownDir[1])+arg.slice(knownDir[0].length);
      } else if (arg.startsWith(this.cwd)) {
        arg = chalk.blue('$PWD')+arg.slice(this.cwd.length);
      }
      if (arg.includes(' ')) {
        return `"${arg}"`;
      }
      return arg;
    }).join(' ');
  }

  onInterrupt = async () => {
    console.log();
    console.log('--> Interrupted, cleaning up...');
    await this.shutdown();
    console.log('    Caio!');
    console.log();
  }

  // Purpose-specific entrypoints

  async createTempDir({andSwitch=false} = {}) {
    let cmdStr = `${chalk.bold('mktemp')} -d`;
    if (andSwitch) {
      cmdStr = `${chalk.bold('cd')} "$(${cmdStr})"`;
    }
    cmdStr = chalk.gray(cmdStr);
    await new Promise(r => process.stdout.write('    '+cmdStr, r));

    try {
      const {stdout} = await execa(`mktemp`, [`-d`]);
      this.tempDirs.push(stdout);
      await new Promise(r => process.stdout.write(chalk.blue(` # ${stdout}`), r));

      if (andSwitch) {
        this.cwd = stdout;
      }
      return stdout;
    } finally {
      await new Promise(r => process.stdout.write(`\n`, r));
    }
  }

  // Generic execution

  async execUtility(cmd, args, opts={}) {
    if (opts.cwd && opts.cwd !== this.cwd) {
      console.log(`   `,
        chalk.gray.bold('cd'),
        chalk.gray(this.formatArgs([opts.cwd])));
    }
    await new Promise(r => process.stdout.write(
      `    ${chalk.gray.bold(cmd)} ${chalk.gray(this.formatArgs(args))}`, r));
    try {
      return await execa(cmd, args, {
        cwd: this.cwd,
        ...opts,
      });
    } finally {
      await new Promise(r => process.stdout.write(`\n`, r));
    }
  }

  launchBackgroundProcess(name, {args=[], ...opts}) {
    if (opts.cwd && opts.cwd !== this.cwd) {
      console.log(`   `,
        chalk.gray.bold('cd'),
        chalk.gray(this.formatArgs([opts.cwd])));
    }
    console.log(`   `,
      chalk.gray.bold(name),
      chalk.gray(this.formatArgs(args)),
      chalk.gray.bold('&'));

    // actually launch the process
    const proc = execa(name, args, {
      all: true,
      buffer: false,
      cwd: this.cwd,
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
    process.off('SIGINT', this.onInterrupt);
    const processPromises = this.processes
      .map(p => p.catch(() => {}));

    for (const process of this.processes) {
      console.log('   ',
        chalk.gray.bold('kill'),
        chalk.gray(process.pid),
        chalk.blue(`# ${this.formatArgs(process.spawnargs)}`));
      process.cancel();
    }
    await Promise.all(processPromises);

    for (const dir of this.tempDirs) {
      await this.execUtility('rm', ['-rf', dir]);
    }
  }

}
module.exports = ServiceRunner;
