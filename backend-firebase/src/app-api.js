const {join, resolve, basename} = require('path');
const fs = require('fs').promises;

const {Environment, FunctionDevice} = require('@dustjs/skylink');
const {FirebaseProject} = require('./firebase-project');

const {Datadog} = require('./lib/datadog.js');
const {AsyncCache} = require('./lib/async-cache.js');

exports.createPublicApi = async function createPublicApi(env) {

  const firebase = new FirebaseProject(
    env.FIREBASE_PROJECT_ID,
    env.FIREBASE_DATABASE_URL);

  Datadog.env = env;
  Datadog.uidTagCache = new AsyncCache({
    async loadFunc(uid) {
      console.log('loading metrics tags for uid', uid);
      const user = await firebase.getUserInfo(uid).then(x => x.email || x.uid, err => uid);
      return { user };
    },
  });

  // where are the schemas?
  // PATH-style list, allowed to be relative to this module's root
  const schemaDirs = (
    env.DUSTJS_SCHEMA_PATH || 'builtin-schemas'
  ).split(':');

  // load all the application schema models
  const {Compiler, SchemaLoader} = env.USING_BABEL ? require('@dustjs/data-tree') : await import('@dustjs/data-tree');
  const loader = new SchemaLoader(resolve(__dirname, '..'));
  for (const schemaDir of schemaDirs) {
    await loader.loadAllInDirectory(schemaDir);
  }
  firebase.registerAllApplications(loader);

  // check that we have some sort of Firebase access
  const credError = await firebase.checkForCredentialError();
  if (credError) {
    console.error(`FATAL: Failed to find a Google credential for Firebase.`);
    console.error(`For local usage, make sure to set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the location of a .json credential file.`);
    console.error();
    throw credError;
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

  return publicEnv;
};
