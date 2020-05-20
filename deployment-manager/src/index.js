const yargs = require('yargs');

exports.runCli = () => yargs
  .option('color')
  .describe('color', 'Enable colorful output (default)')
  .option('no-color')
  .describe('no-color', 'Disable colorful output regardless of terminal')

  // our commands
  .usage('Usage: $0 <command> ...')
  .command('apply', 'roll out changes to the cloud',
    require('./cmd-apply.js'))
  .demandCommand()

  // version
  .alias('v', 'version')
  .version()
  .describe('v', 'show version information')

  // help text
  .alias('h', 'help')
  .help('help')
  .showHelpOnFail(false, "Specify --help for available options")

  .strict()
  .argv; // do the parse
