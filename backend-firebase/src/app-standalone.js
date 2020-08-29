const {WebServer, SkylinkExport} = require('@dustjs/server-koa');
const {Environment, FunctionDevice} = require('@dustjs/skylink');

const {createPublicApi} = require('./app-api.js');

(async () => {

  // set up the skylink API
  let publicEnv;
  try {
    publicEnv = await createPublicApi(process.env);
  } catch (err) {
    console.error(err);
    return process.exit(5);
  }

  // set up a web server
  const web = new WebServer();

  // serve skylink protocol
  const allowedOrigins = process.env.SKYLINK_ALLOWED_ORIGINS;
  web.mountApp('/~~export', new SkylinkExport(publicEnv, {
    allowedOrigins: allowedOrigins ? allowedOrigins.split(',') : [],
  }));

  console.log('App listening on', await web.listen(9231, '0.0.0.0'));

  // Self-test
  if (process.argv.includes('--test')) {
    const appTest = await import('./app_test.mjs');
    await appTest.default(web.selfDescribeUri());
  }

})().then(() => {/*process.exit(0)*/}, err => {
  console.error();
  console.error('!-> Backend crashed:');
  console.error(err.stack || err);
  process.exit(1);
});
