const {promisify} = require('util');
const execAsync = promisify(require('child_process').exec);
const setTimeoutAsync = promisify(setTimeout)

exports.ExecForOutput = function ExecForLine({
  command,
  timeout = '5 seconds',
}={}) {
  const timeoutP = setTimeoutAsync(parseTimeToMs(timeout)).then(() =>
    Promise.reject(new Error(`execForLine() timeout: ${timeout}`)));
  //timeoutP.catch(() => null);
  return Promise.race([
    execAsync(command),
    timeoutP,
  ]);
}

exports.ExecForLine = async function ExecForLine(opts={}) {
  const {stdout, stderr} = await ExecForOutput(opts);
  if (stderr.length > 0)
    console.warn('WARN: exec() stderr:', stderr);
  return stdout.trim();
}

// Parses string fragments like '5 minutes' into a # of milliseconds
function parseTimeToMs(time) {
  if (typeof time !== 'string') return time;
  let match = time.match(/^([0-9.]+) ?([a-z]+)$/);
  if (!match) throw new Error(
    `parseTimeToMs given invalid string`);

  const [_, num, unit] = match;
  const millis = moment.duration(+num, unit).asMilliseconds();

  // catch invalid parses (moment still counts as valid)
  if (millis === 0 && num !== '0') throw new Error(
    `parseTimeToMs failed to interpret input unit '${unit}'`);
  return millis;
};
