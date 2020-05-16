const admin = require('firebase-admin');
const defaultCredential = admin.credential.applicationDefault();

const {PathFragment} = require('@dustjs/skylink');
const {SessionMgmt} = require('./session-mgmt.js');
const {ServiceMgmt} = require('./service-mgmt.js');
const {UserSession} = require('./user-session.js');

class FirebaseProject {
  constructor(projectId, firebaseUrl, credential=defaultCredential) {
    this.fireApp = admin.initializeApp({
      credential, projectId,
      databaseURL: firebaseUrl,
    }, projectId);

    this.sessionColl = this.fireApp
      .firestore().collection('sessions');
    this.userColl = this.fireApp
      .firestore().collection('users');
    // TODO: place to store shared data in a central location
    // this.libraryColl = this.fireApp
    //   .firestore().collection('libraries');

    this.applications = new Map; // appId => UserApplication

    // ServiceMgmt uses a CollectionGroup across the whole Firestore
    this.serviceMgmt = new ServiceMgmt(this.fireApp.firestore());

    // set up state
    this.sessionMgmt = new SessionMgmt(this.sessionColl, async snapshot => {
      // TODO: check expiresAt
      return new UserSession(
        snapshot.id,
        snapshot.get('uid'),
        snapshot.get('authority'),
        this.applications,
        this.userColl.doc(snapshot.get('uid')),
        await this.getUserServices(snapshot.get('uid')));
    });

  }

  /*async*/ getUserServices(uid) {
    const collRef = this.userColl.doc(uid).collection('services');
    return this.serviceMgmt.getServices(collRef);
  }

  /*async*/ getUserInfo(uid) {
    return this.fireApp.auth().getUser(uid);
  }

  async checkForCredentialError() {
    // check that we have some sort of access
    const {credential} = this.fireApp.options;
    try {
      await credential.getAccessToken();
      return false;
    } catch (err) {
      return err.message;
    }
  }

  async registerApplication(appId, schemaImportPath) {
    console.log('Registering app', appId, '...');
    const schema = await import(schemaImportPath);

    const {Compiler} = await import('@dustjs/data-tree');
    const compiler = new Compiler({
      target: 'firestore',
      pathParser(path) {
        return PathFragment.from(path);
      },
      // TODO
      // stackValidator(stack) {
    });

    const dataTree = compiler.compile(schema);
    this.applications.set(appId, dataTree);
    // throw new Error(`TODO: registerApplication()`);
  }

  // Creates + returns new sessionId if the token is recognized
  // We need to validate these ourselves, firebase doesn't manage these tokens
  async redeemUserAppToken(userId, tokenSecret) {

    // find the user's token document by secret
    const tokenQuery = await this.userColl
      .doc(userId).collection('tokens')
      .where('secret', '==', tokenSecret)
      .limit(1).get();
    if (tokenQuery.empty) throw new Error(
      `App Token not found`);
    const tokenSnap = tokenQuery.docs[0];

    // fetch the Firebase user record
    const userRecord = await this.getUserInfo(userId);
    if (userRecord.disabled) throw new Error(
      `Cannot create a session: User is disabled`);
    if (userRecord.tokensValidAfterTime) {
      const validSince = new Date(userRecord.tokensValidAfterTime);
      if (validSince >= tokenSnap.get('issuedAt').toDate()) throw new Error(
        `Cannot create a session: User's tokens are revoked`);
    }

    // issue a session for the app
    console.log(`Token`, JSON.stringify(tokenSnap.get('name')),
      `launching for`, userRecord.displayName||userRecord.email,
      '/', tokenSnap.get('appId'));
    return await this.createUserSession(userId, tokenSnap.ref, {
      authority: 'AppToken',
      application: tokenSnap.get('appId'),
      tokenId: tokenSnap.id,
    });
  }

  async redeemUserIdToken(idToken, appId) {
    const token = await this.fireApp.auth().verifyIdToken(idToken);
    const userRecord = await this.getUserInfo(token.uid);
    const userRef =  this.userColl.doc(userRecord.uid);

    console.log(`App`, JSON.stringify(appId),
      `launching for`, userRecord.displayName||userRecord.email);
    return await this.createUserSession(userRecord.uid, userRef, {
      authority: 'IdToken',
      application: appId,
    });
  }

  async createUserSession(userId, bookkeepRef, sessFields) {
    // create randomly-ID'd session document
    const sessionId = await this.sessionMgmt
      .createSession(userId, sessFields);

    // update bookkeeping
    await bookkeepRef.set({
      launchedAt: new Date,
    }, {
      mergeFields: ['launchedAt'],
    });

    return sessionId;
  }
}

exports.FirebaseProject = FirebaseProject;
