import * as clr from 'https://deno.land/std@0.78.0/fmt/colors.ts';

const KnownDirs = new Array<[string,string]>();

const signals = [
  Deno.signal(Deno.Signal.SIGINT),
  Deno.signal(Deno.Signal.SIGTERM),
];
export function disregardSignals() {
  signals.forEach(x => x.dispose());
  signals.length = 0;
}
const cleaningUp = Promise.race(signals).then(disregardSignals);

export class ServiceRunner {
  constructor(cwd?: string) {
    this.cwd = cwd || Deno.cwd();
    cleaningUp.then(this.onInterrupt);
  }
  cwd: string;
  processes = new Array<ChildProcess>();
  tempDirs = new Array<string>();
  shuttingDown = false;

  setDefaultWorkDir(workDir: string) {
    console.log(`   `,
      clr.gray(clr.bold('cd')),
      clr.gray(this.formatArgs([workDir])));
    this.cwd = workDir;
  }
  static registerKnownDir(prefix: string, variable: string) {
    console.log(`   `,
      clr.blue(variable.slice(1))
      +clr.gray('='+prefix));
    KnownDirs.push([prefix, variable]);
  }
  addTempDir(tempDir: string) {
    this.tempDirs.push(tempDir);
  }
  formatArgs(args: string[]) {
    return args.map(arg => {
      const knownDir = KnownDirs
        .find(([prefix]) => arg.startsWith(prefix));
      if (knownDir) {
        arg = clr.blue(knownDir[1])+arg.slice(knownDir[0].length);
      } else if (arg.startsWith(this.cwd)) {
        arg = clr.blue('$PWD')+arg.slice(this.cwd.length);
      }
      if (arg.includes(' ')) {
        return `"${arg}"`;
      }
      return arg;
    }).join(' ');
  }

  onInterrupt = async () => {
    if (this.shuttingDown) return;
    console.log();
    console.log('--> Interrupted, cleaning up...');
    await this.shutdown();
    console.log('    Caio!');
    console.log();
  }

  // Purpose-specific entrypoints

  async createTempDir({andSwitch=false} = {}) {
    let cmdStr = `${clr.bold('mktemp')} -d`;
    if (andSwitch) {
      cmdStr = `${clr.bold('cd')} "$(${cmdStr})"`;
    }
    cmdStr = clr.gray(cmdStr);
    await Deno.stdout.write(new TextEncoder().encode('    '+cmdStr));

    try {
      const proc = Deno.run({cmd: [`mktemp`, `-d`], stdout: 'piped'});
      const stdout = new TextDecoder('utf-8').decode(await proc.output()).trim();
      this.tempDirs.push(stdout);
      await Deno.stdout.write(new TextEncoder().encode(clr.blue(` # ${stdout}`)));

      if (andSwitch) {
        this.cwd = stdout;
      }
      return stdout;
    } finally {
      await Deno.stdout.write(new TextEncoder().encode(`\n`));
    }
  }

  // Generic execution

  async execUtility(cmd: string, args: string[], opts: {cwd?: string} = {}): Promise<{stdout: string, stderr: string, status: Deno.ProcessStatus}> {
    if (opts.cwd && opts.cwd !== this.cwd) {
      console.log(`   `,
        clr.gray(clr.bold('cd')),
        clr.gray(this.formatArgs([opts.cwd])));
    }
    await Deno.stdout.write(new TextEncoder().encode(
      `    ${clr.gray(clr.bold(cmd))} ${clr.gray(this.formatArgs(args))}`));
    try {
      const proc = Deno.run({
        cmd: [cmd, ...args],
        cwd: this.cwd,
        stdout: 'piped',
        stderr: 'piped',
        ...opts,
      });
      const [stdoutRaw, stderrRaw, status] = await Promise.all([proc.output(), proc.stderrOutput(), proc.status()]);
      const stdout = new TextDecoder().decode(stdoutRaw);
      const stderr = new TextDecoder().decode(stderrRaw);
      if (!status.success) {
        throw new Error(`Command '${cmd}' exited with status ${status}.\n`+stderr);
      }
      return {stdout, stderr, status};
    } finally {
      await Deno.stdout.write(new TextEncoder().encode(`\n`));
    }
  }

  launchBackgroundProcess(cmd: string, opts: {
    args?: string[];
    cwd?: string;
    env?: Record<string,string>;
  }): ChildProcess {
    if (opts.cwd && opts.cwd !== this.cwd) {
      console.log(`   `,
        clr.gray(clr.bold('cd')),
        clr.gray(this.formatArgs([opts.cwd])));
    }
    console.log(`   `,
      clr.gray(clr.bold(cmd)),
      clr.gray(this.formatArgs(opts.args ?? [])),
      clr.gray(clr.bold('&')));

    // actually launch the process
    const proc = new ChildProcess(Deno.run({
      cmd: [cmd, ...(opts.args ?? [])],
      cwd: opts.cwd ?? this.cwd,
      env: opts.env,
      stdin: 'null',
      stdout: 'piped',
      stderr: 'piped',
    }));

    this.addBackgroundProcess(proc);
    return proc;
  }

  // add a process to the background list
  // these will be monitored and also stopped when we want to exit
  addBackgroundProcess(process: ChildProcess) {
    this.processes.push(process);
    process.status.then(status => {
      if (this.shuttingDown) return;
      console.log('Process', process.proc.pid, 'ended:', status.code);
    });
  }

  async shutdown() {
    this.shuttingDown = true;
    // signals.forEach(x => x.dispose()); // prevent future interupts
    const processPromises = this.processes
      .map(p => p.status.catch(() => {}));

    for (const process of this.processes) {
      console.log('   ',
        clr.gray(clr.bold('kill')),
        clr.gray(process.proc.pid.toString(10)),
        clr.blue(`# ${this.formatArgs(['TODO', 'process.spawnargs'])}`));
      process.cancel();
    }
    await Promise.all(processPromises);

    for (const dir of this.tempDirs) {
      await this.execUtility('rm', ['-rf', dir]);
    }
  }

}

import {
  ReadLineTransformer, readableStreamFromReaderCloser,
} from 'https://deno.land/x/kubernetes_client@v0.1.0/stream-transformers.ts';
import { readableStreamFromAsyncIterator } from "https://raw.githubusercontent.com/danopia/deno-kubernetes_client/fecd8ed2a868390cf500d7147c0940314c5042aa/stream-transformers.ts";

class ChildProcess {
  proc: Deno.Process<Deno.RunOptions & {stdout: 'piped', stderr: 'piped'}>;
  status: Promise<Deno.ProcessStatus>;
  constructor(proc: Deno.Process<Deno.RunOptions & {stdout: 'piped', stderr: 'piped'}>) {
    this.proc = proc;
    this.status = proc.status();
  }
  cancel() {
    this.proc.kill(15); // SIGTERM
  }
  perLine() {
    return readableStreamFromAsyncIterator(combine([
      Deno.iter(this.proc.stderr, {bufSize: 1024}),
      Deno.iter(this.proc.stdout, {bufSize: 1024}),
    ])).pipeThrough(new ReadLineTransformer('utf-8'));
  }
  async stdout() {
    return new TextDecoder('utf-8').decode(await this.proc.output());
  }
}


// port of https://stackoverflow.com/a/50586391
async function* combine<T>(iterable: Iterable<AsyncIterableIterator<T>>) {
  const asyncIterators = Array.from(iterable, o => o[Symbol.asyncIterator]());
  const results = [];
  let count = asyncIterators.length;
  let complete: (() => void) | undefined;
  const never = new Promise<{index:number,result:IteratorResult<T,any>}>(ok => {complete = ok});
  function getNext(asyncIterator: AsyncIterator<T>, index: number) {
      return asyncIterator.next().then(result => ({
          index,
          result,
      }));
  }
  const nextPromises = asyncIterators.map(getNext);
  try {
      while (count) {
          const {index, result} = await Promise.race(nextPromises);
          if (result.done) {
              nextPromises[index] = never as Promise<any>;
              results[index] = result.value;
              count--;
          } else {
              nextPromises[index] = getNext(asyncIterators[index], index);
              yield result.value;
          }
      }
  } finally {
      for (const [index, iterator] of asyncIterators.entries())
          if (nextPromises[index] != never && iterator.return != null)
              iterator.return();
      if (complete) complete();
      // no await here - see https://github.com/tc39/proposal-async-iteration/issues/126
  }
  return results;
}
