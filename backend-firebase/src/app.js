const {WebServer, SkylinkExport} = require('@dustjs/server-koa');
const {Environment, FunctionDevice} = require('@dustjs/skylink');

const {FirebaseProject} = require('./firebase-project');

const firebase = new FirebaseProject(
  process.env.FIREBASE_PROJECT_ID,
  process.env.FIREBASE_DATABASE_URL);

const {Datadog} = require('./lib/datadog.js');
const {AsyncCache} = require('./lib/async-cache.js');
Datadog.uidTagCache = new AsyncCache({
  async loadFunc(uid) {
    console.log('loading metrics tags for uid', uid);
    const user = await firebase.getUserInfo(uid);
    return {
      user: user.email || user.uid,
    };
  },
});

(async () => {

  // load all the application schema models
  await firebase.registerApplication('panel', '../schemas/panel.mjs');
  await firebase.registerApplication('editor', '../schemas/editor.mjs');
  await firebase.registerApplication('irc', '../schemas/irc.mjs');

  // check that we have some sort of Firebase access
  const credError = await firebase.checkForCredentialError();
  if (credError) {
    console.error(`FATAL: Failed to find a Google credential for Firebase.`);
    console.error(`For local usage, make sure to set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the location of a .json credential file.`);
    console.error();
    console.error(credError);
    process.exit(5);
  }

  // set up the skylink API
  const publicEnv = new Environment;
  publicEnv.bind('/sessions', firebase.sessionMgmt);

  // mount the current client (thru reversal) as a registered service
  // TODO: put this inside the service's env
  // invoke "/my-session-id/services/publish"
  publicEnv.bind('/publish%20service', new FunctionDevice({
    async invoke(input) {
      const sessionId = input.getChild('Session ID', true, 'String').StringValue;
      const serviceId = input.getChild('Service ID', true, 'String').StringValue;
      const deviceRef = input.getChild('Ref', true, 'Device');

      // add the given device to the user's service environment
      const sessionSnap = await firebase.sessionColl.doc(sessionId).get();
      const serviceEnv = await firebase.getUserServices(sessionSnap.get('uid'));
      await serviceEnv.registerServiceDevice(serviceId, deviceRef);

      return { Type: 'String', StringValue: 'ok' };
    }}));

  // interactive sessions authenticated by Firebase JWTs
  publicEnv.bind('/idtoken-launch', new FunctionDevice({
    async invoke(input) {
      const sessionId = await firebase.redeemUserIdToken(
        input.getChild('ID Token', true, 'String').StringValue,
        input.getChild('App ID', true, 'String').StringValue);
      return { Type: 'String', StringValue: sessionId };
    }}));

  // automated sessions authenticated by static randomized strings
  publicEnv.bind('/apptoken-launch', new FunctionDevice({
    async invoke(input) {
      const sessionId = await firebase.redeemUserAppToken(
        input.getChild('User ID', true, 'String').StringValue,
        input.getChild('Token', true, 'String').StringValue);
      return { Type: 'String', StringValue: sessionId };
    }}));

  // TODO: push back the expiresAt of a given still-valid session
  // publicEnv.bind('/renew-session', new FunctionDevice({
  //   async invoke(input) {
  //     console.log('TODO: automaton launch w/', input, {userId, tokenId});
  //     return { Type: 'Error', StringValue: 'TODO' };
  //   }}));

  // TODO: issue an AppToken
  // publicEnv.bind('/create-apptoken', new FunctionDevice({
  //   require('crypto').randomBytes(24).toString('base64')

  // set up a web server
  const web = new WebServer();

  // serve skylink protocol
  const allowedOrigins = process.env.SKYLINK_ALLOWED_ORIGINS;
  web.mountApp('/~~export', new SkylinkExport(publicEnv, {
    allowedOrigins: allowedOrigins ? allowedOrigins.split(',') : [],
  }));

  console.log('App listening on', await web.listen(9231, '0.0.0.0'));

  // Self-test
  const appTest = await import('./app_test.mjs');
  await appTest.default(web.selfDescribeUri());

})().then(() => {/*process.exit(0)*/}, err => {
  console.error();
  console.error('!-> Backend crashed:');
  console.error(err.stack || err);
  process.exit(1);
});
