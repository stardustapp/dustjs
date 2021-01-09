const {Environment, FunctionDevice} = require('@dustjs/skylink');

const {FirestoreRegionDevice} = require('./firestore/region-device.js');

// const Firestore = require('./firestore-lib.js');
// const {DatePartitionedLog} = require('./firestore/date-log.js');
// const {StringMapField} = require('./firestore/string-map.js');

class UserSession {
  constructor(sessId, userId, authority, appMap, userRef, serviceEnv, firebase_ToBeRemoved) {
    this.sessId = sessId;
    this.userId = userId;
    this.authority = authority;
    this.appMap = appMap;
    this.userRef = userRef;

    this.env = new Environment;
    this.env.bind('/mnt/services', serviceEnv);

    this.env.bind('/mnt/config',
      new FirestoreRegionDevice(this, 'config'));
    this.env.bind('/mnt/persist',
      new FirestoreRegionDevice(this, 'persist'));

    // automated sessions authenticated by static randomized strings
    this.env.bind('/mnt/assume-user', new FunctionDevice({
      invoke: async (input) => {
        const sessionId = await firebase_ToBeRemoved.assumeUserFromSession(
          input.getChild('User ID', true, 'String').StringValue,
          input.getChild('App ID', true, 'String').StringValue,
          this.sessId);
        return { Type: 'String', StringValue: sessionId };
      }}));
  }
}

module.exports = {
  UserSession,
};
