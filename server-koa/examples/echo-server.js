const {WebServer, SkylinkExport} = require('..');
const {Environment} = require('@dustjs/standard-machine-rt');
const fetch = require('node-fetch');

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
  try {
    console.log();
    const exportUrl = web.selfDescribeUri({
      path: '/~~export',
    });
    console.group(`Sending test request to ${exportUrl}`);

    const result = await sendTest(exportUrl, {
      Type: 'String',
      StringValue: 'Hello, World',
    });
    console.log('Self-test output:', result);

  } catch (err) {
    console.warn(`WARN: Self-test failed:`, err.message)
  } finally {
    console.groupEnd();
    console.log();
  }

})().catch(err => {
  console.log(err);
  process.exit(10);
})

// helper to send ourselves payloads
// we could use the dustjs client, but this is simpler
// TODO: switch to dustjs once it's refactored and stablized
async function sendTest(url, input) {
  const resp = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      Op: 'invoke',
      Path: '/echo/invoke',
      Input: input,
    }),
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  const json = await resp.json();
  if (json.Ok !== true) throw new Error(
    `Self-test response wasn't Ok!`);

  return json.Output;
}
