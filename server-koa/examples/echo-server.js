const {WebServer, SkylinkExport} = require('..');
const {Environment, StatelessHttpSkylinkClient} = require('@dustjs/skylink');

(async function() {

  // create echo API
  const publicEnv = new Environment;
  publicEnv.mount('/echo', 'function', {
    async invoke(input) {
      if (input) {
        console.log(`Echoing the user's ${input.Type} entry`);
      }
      return input;
    }});

  // serve it
  const web = new WebServer();
  web.mountApp('/~~export', new SkylinkExport(publicEnv));
  console.log('Listening on', await web.listen(9230));

  // test ourselves once
  const exportUrl = web.selfDescribeUri({ path: '/~~export' });
  // support using in a test suite
  const isOneShot = process.argv.includes('--one-shot');
  try {
    console.log();
    console.group(`Sending test request to ${exportUrl}`);

    const client = new StatelessHttpSkylinkClient(exportUrl);
    const response = await client.volley({
      Op: 'invoke',
      Path: '/echo/invoke',
      Input: {
        Type: 'String',
        StringValue: 'Hello, World',
      }});

    if (response.Ok !== true) throw new Error(
      `Self-test response wasn't Ok!`);
    console.log('Self-test output:', response.Output);

  } catch (err) {
    console.warn(`WARN: Self-test failed:`, err.message);
    if (isOneShot) throw err;

  } finally {
    console.groupEnd();
    console.log();
  }
  if (isOneShot) process.exit(0);

})().catch(err => {
  console.log(err);
  process.exit(10);
});
