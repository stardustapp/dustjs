const {AsyncCache} = require('./lib/async-cache.js');
const {Datadog} = require('./lib/datadog.js');

exports.SessionMgmt =
class SessionMgmt {
  constructor(rootRef, sessionLoader) {
    this.rootRef = rootRef;

    this.sessionCache = new AsyncCache({
      loadFunc: async sessId => {
        const sessRef = this.rootRef.doc(sessId);
        Datadog.countFireOp('read', sessRef, {fire_op: 'get', method: 'session/load'});
        const sessData = await sessRef.get();
        if (!sessData.exists) return null;
        return sessionLoader(sessData);
      },
    });

    setTimeout(this.cleanupNow, 1000);
  }

  async createSession(uid, metadata={}) {
    const now = new Date;
    Datadog.countFireOp('write', this.rootRef, {fire_op: 'add', method: 'session/create'});
    const sessionRef = await this.rootRef.add({
      uid, ...metadata,
      createdAt: now,
      expiresAt: new Date(+now + (1/*days*/ * 24 * 60 * 60 * 1000)),
    });
    return sessionRef.id;
  }

  async getEntry(path) {
    if (path.length < 2) return null;
    const secondSlash = path.indexOf('/', 1);
    if (secondSlash < 2) return null;
    const sessionId = path.slice(1, secondSlash);
    const subPath = path.slice(secondSlash);
    // console.log('session access:', sessionId, subPath);

    const session = await this.sessionCache.get(sessionId);
    if (!session) return null;
    return await session.env.getEntry(subPath);
  }

    // // direct name, load it up
    // const domainRef = this
    //   .adminApp.firestore()
    //   .collection('domains')
    //   .doc(fqdn);

  cleanupNow = async () => {
    let expiredCount = 0;
    try {
      console.log('Cleaning up expired sessions...');

      const querySnap = await this.rootRef
        .where("expiresAt", "<", new Date(new Date() - 24*60*60*1000))
        .orderBy("expiresAt", "asc")
        .limit(25)
        .get();

      expiredCount = querySnap.size;

      Datadog.countFireOp('read', this.rootRef, {
        fire_op: 'query', method: 'session/cleanup'
      }, expiredCount||1);
      Datadog.countFireOp('write', this.rootRef, {
        fire_op: 'delete', method: 'session/cleanup'
      }, expiredCount);

      for (const docSnap of querySnap.docs) {
        await docSnap.ref.delete();
      }
      console.log('deleted', expiredCount, 'expired sessions');

    } finally {
      // several times a day
      const delaySecs = expiredCount >= 25 ? 1 : (12*60*60);
      setTimeout(this.cleanupNow, delaySecs * 1000);
    }
  }
}
