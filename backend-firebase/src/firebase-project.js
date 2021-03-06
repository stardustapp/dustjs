const admin = require('firebase-admin');
const defaultCredential = admin.credential.applicationDefault();

const adminUids = (process.env.FIREBASE_ADMIN_UIDS || '').split(',');
if (!adminUids.slice(-1)[0]) adminUids.pop();

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
        await this.getUserServices(snapshot.get('uid')),
        this, // firebase_ToBeRemoved
      );
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

  registerAllApplications(schemaLoader) {
    this.applications = schemaLoader.compileAll({
      target: 'firestore',
    });
    console.log('Registered Firebase apps:',
      Array.from(this.applications.keys()));
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

    // check if the user is actually a system user
    const userSnap = await this.userColl
      .doc(userId).get();
    if (userSnap.get('system') == true) {

      // issue a session for the app
      console.log(`Token`, JSON.stringify(tokenSnap.get('name')),
        `launching for system user`, userId,
        '/', tokenSnap.get('appId'));
      return await this.createUserSession(userId, tokenSnap.ref, {
        authority: 'AppToken',
        application: tokenSnap.get('appId'),
        tokenId: tokenSnap.id,
        system: true,
      });
    }

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


  // Creates + returns new sessionId if the session is valid
  // Has authorization checks to only enable some assuming
  // Effectively 'sudo' I guess
  async assumeUserFromSession(userId, appId, fromSessionId) {
    if (!fromSessionId) throw new Error(
      `Session ID not given`);

    // check that the original session belongs to an admin
    const sessionQuery = await this.sessionColl
      .doc(fromSessionId).get();
    if (sessionQuery.empty) throw new Error(
      `User Session not found`);
    const fromUserId = sessionQuery.get('uid');
    if (!fromUserId) throw new Error(
      `Invalid Session Dataa`);
    if (!adminUids.includes(fromUserId)) throw new Error(
      `Admin Access Denied`);

    // check if the user is a system user -- admins can assume them
    const userSnap = await this.userColl
      .doc(userId).get();
    if (userSnap.get('system') !== true) throw new Error(
      `Invalid User to assume`);

    // issue a session for the app
    console.log(`User`, JSON.stringify(fromUserId),
      `/`, JSON.stringify(sessionQuery.get('application')),
      `launching to system user`, userId,
      '/', appId);

    // TODO: session should expire when parent session expires
    return await this.createUserSession(userId, userSnap.ref
      .collection('assumers')
      .doc(fromUserId)
    , {
      authority: 'Assumed',
      application: appId,
      sourceUser: fromUserId,
      firstCreatedAt: new Date(),
      system: true,
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
