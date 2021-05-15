const {Datadog} = require('./lib/datadog.js');
const {AsyncCache} = require('./lib/async-cache.js');
const {FirestoreCollectionDevice} = require('./firestore/collection-device.js');
const {StringEntry} = require('@dustjs/skylink');

const {
  Environment,
  PathFragment,
  SkylinkServer, SkylinkClient, SkylinkClientEntry,
} = require('@dustjs/skylink');

const myHostname = require('os').hostname();

class ServiceMgmt {
  constructor(firestore) {
    this.frameListeners = new Map;
    this.unmappedResponses = new Map;

    this.readyFrames = firestore
      .collectionGroup('frames')
      .where('origin.hostname', '==', myHostname)
      .orderBy('fulfilled.date');

    this.stopSnapsCb = this.readyFrames.onSnapshot(async querySnap => {
      for (const docChange of querySnap.docChanges()) {
        if (docChange.type === 'added') {
          this.processFulfilledFrameDocument(docChange.doc);
        }
      }
    });

    this.servicesCollCache = new AsyncCache({
      keyFunc(ref) {
        return ref.path;
      },
      loadFunc: async (ref) => {
        const instance = new UserServicesMgmt(this, ref);
        await instance.setup();
        return instance;
      },
    });
  }

  async processFulfilledFrameDocument(docSnap) {
    const docPath = docSnap.ref.path;
    Datadog.countFireOp('read', docSnap.ref, {fire_op: 'watched', method: 'services/readyFrames'});

    console.log('received ready frame', docSnap.get('request.Op'), '- ok', docSnap.get('response.Ok'));

    const listener = this.frameListeners.get(docPath);
    if (listener) {
      listener(docSnap.get('response'));
      this.frameListeners.delete(docPath);
    } else {
      console.log("WARN: received response for unmapped frame", docPath, "- caching response in hope of eventual consistency");
      this.unmappedResponses.set(docPath, docSnap.get('response'));
    }

    Datadog.countFireOp('write', docSnap.ref, {fire_op: 'delete', method: 'services/readyFrames'});
    await docSnap.ref.delete();
  }

  getServices(collRef) {
    return this.servicesCollCache.get(collRef);
  }
}

class UserServicesMgmt {
  constructor(serviceMgmt, collRef) {
    console.log(`Setting up UserServicesMgmt for`, collRef.path);
    this.serviceMgmt = serviceMgmt;
    this.collRef = collRef;
    this.services = new Map;
    this.localEndpoints = new Map;
  }

  async registerServiceDevice(serviceId, deviceEntry) {
    this.localEndpoints.set(serviceId, deviceEntry);

    await this.collRef
      .doc(serviceId)
      .set({
        apiHostname: myHostname,
        lastMounted: new Date,
        // serviceUri: 'todo://',
        canFireProxy: true,
      });

    // temporary shutdown mechanism
    // TODO: health should instead be sniffed from deviceEntry like so:
    // (await deviceEntry.getEntry('/')).subscribe(...)
    // ^^ do the shut down if that sub stops
    return async () => {
      if (this.localEndpoints.get(serviceId) === deviceEntry) {
        console.log('service-mgmt: Removing local endpoint for', serviceId);
        this.localEndpoints.delete(serviceId);

        await this.collRef
          .doc(serviceId)
          .update({
            canFireProxy: false,
          }, {
            apiHostname: myHostname,
          });
      }
    }
  }

  getEntry(fullPath) {
    const path = PathFragment.parse(fullPath);
    if (path.count() > 0) {
      const svcName = decodeURIComponent(path.parts[0]);
      const svc = this.services.get(svcName);
      if (svc) {
        return svc.getEntry(path.slice(1).toString());
      }
    } else {
      return {
        get() {
          return {Type: 'Folder'};
        },
        enumerate: (enumer) => {
          enumer.visit({Type: 'Folder'});
          if (!enumer.canDescend()) return;
          for (const [name, svc] of this.services) {
            enumer.descend(name);
            enumer.visit({Type: 'Folder'});
            enumer.ascend();
          }
        },
      };
    }
  }

  async setup() {
    const promise = new Promise((resolve, reject) => {
      Datadog.countFireOp('stream', this.collRef, {fire_op: 'onSnapshot', method: 'sessions/subscribe'});
      const stopSnapsCb = this.collRef.onSnapshot(querySnap => {
        Datadog.countFireOp('read', this.collRef, {fire_op: 'watched', method: 'sessions/subscribe'}, querySnap.docChanges().length||1);
        for (const docChange of querySnap.docChanges()) {
          switch (docChange.type) {
            case 'added':
              const newSvc = new UserService(docChange.doc.ref, docChange.doc.id, this.localEndpoints, this.serviceMgmt);
              this.services.set(docChange.doc.id, newSvc);
            case 'modified':
              this.services.get(docChange.doc.id).configure(docChange.doc);
              break;
            case 'removed':
              // TODO: probably more cleanup?
              this.services.delete(docChange.doc.id);
              break;
            default:
              throw new Error(`weird docChange.type ${docChange.type}`);
          }
        }

        resolve(this);
      },
      error => {
        console.error('WARN: UserServicesMgmt#setup snap error:',
            error.code, error.stack || error.message);
        reject(error);
      });
    });
    // c.onStop(stopSnapsCb);

    await promise;
  }
}

class UserService {
  constructor(docRef, svcId, localEndpoints, serviceMgmt) {
    this.docRef = docRef;
    this.svcId = svcId;
    this.localEndpoints = localEndpoints;
    this.serviceMgmt = serviceMgmt;
    // indirect SkylinkClient impl
    this.proxiedClient = new ProxiedServiceClient(this);

    this.env = new Environment;
    this.env.bind('/mnt', { getEntry: this.getMntEntry.bind(this) });
    this.getEntry = this.env.getEntry.bind(this.env);

    this.env.bind('/current server', { getEntry: (path) => ({
      get: () => new StringEntry('current server', this.latestSnap?.apiHostname),
    })});

    frameCollSpecPromise.then(frameCollSpec => {
      this.env.bind('/recent-frames', new FirestoreCollectionDevice(
        docRef.collection('frames'),
        frameCollSpec,
        {
          readOnly: true,
          readOnlyExceptions: ['state'],
          defaultQuery: {
            orderBy: { field: 'origin.date', direction: 'desc'},
            limit: 15,
          }},
        ));
    });
  }

  async processWaitingFrameDocument(docSnap) {
    console.log('received waiting frame', docSnap.get('request.Op'), docSnap.id);
    let response = {
      Ok: false,
    };

    const endpoint = this.localEndpoints.get(this.svcId);
    if (endpoint) {
      const fireRequest = docSnap.get('request');

      const server = new SkylinkServer(endpoint);
      const innerResponse = await server.processFrame({
        ...fireRequest,
        Input: JSON.parse(fireRequest.Input),
      });
      response = {
        ...innerResponse,
        Output: JSON.stringify(innerResponse.Output || null),
      };
    } else {
      response.Output = JSON.stringify({
        Type: 'Error',
        Authority: myHostname,
        StringValue: `BUG: I am supposed to have service "${this.svcId}" locally but I don't actually have it. Sorry`,
      });
    }

    Datadog.countFireOp('write', docSnap.ref, {fire_op: 'merge', method: 'services/waitingFrames'});
    await docSnap.ref.set({
      response,
      state: 'Done',
      fulfilled: {
        date: new Date,
        hostname: myHostname,
      },
    }, {
      mergeFields: ['response', 'state', 'fulfilled'],
    });
  }

  configure(docSnap) {
    console.log('configuring svc', this.docRef.path, 'for hostname', docSnap.get('apiHostname'));
    this.latestSnap = docSnap.data();

    // set up observing if it's us
    if (docSnap.get('apiHostname') === myHostname && docSnap.get('canFireProxy')) {
      if (this.stopListening) return;

      if (!this.localEndpoints.has(this.svcId)) {
        console.log('service-mgmt rejecting fireproxy for nonexistent svcId', this.svcId, this.docRef.path);
        docSnap.ref.set({
          canFireProxy: false,
        });
        return;
      }

      console.log('service-mgmt starting listener for', this.docRef.path);
      this.stopListening = this.docRef
        .collection('frames')
        .where('state', '==', 'Waiting')
        .orderBy('origin.date')
        .limit(5)
        .onSnapshot(async querySnap => {
          for (const docChange of querySnap.docChanges()) {
            Datadog.countFireOp('read', docChange.doc.ref, {fire_op: 'watched', method: 'services/waitingFrames'});
            if (docChange.type === 'added') {
              await this.processWaitingFrameDocument(docChange.doc);
            }
          }
        });
    } else if (this.stopListening) {
      console.log('service-mgmt stopping listener for', this.docRef.path);
      this.stopListening();
      this.stopListening = null;
    }
  }

  getMntEntry(path) {
    if (this.latestSnap.apiHostname === myHostname) {
      const endpoint = this.localEndpoints.get(this.svcId);
      if (endpoint) {
        return endpoint.getEntry(path);
      } else {
        console.error(`WARN: we're supposed to have "${this.docRef.path}" locally but I don't have it`);
      }
    } else if (this.latestSnap.canFireProxy) {
      return new SkylinkClientEntry(this.proxiedClient, path);
    }
  }
}

// API used to issue Skylink requests indirectly
class ProxiedServiceClient extends SkylinkClient {
  constructor(service) {
    super();
    this.service = service;
  }

  async volley(request) {
    // TODO: try talking directly over HTTP before falling back to fireproxy

    const frameCollRef = this.service.docRef.collection('frames');
    Datadog.countFireOp('write', frameCollRef, {fire_op: 'add', method: 'service/request'});
    // console.log(request)
    const newDoc = await frameCollRef.add({
      state: 'Waiting',
      request: {
        ...request,
        Input: JSON.stringify(request.Input || null),
      },
      origin: {
        hostname: myHostname,
        date: new Date,
      },
    });

    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        Datadog.count('service.timeout', 1, {service_id: this.service.svcId});
        reject(new Error(`UserService#volley times out at 5 seconds`));
      }, 5000);

      // There's a race condition where a fast service proxy
      // can fulfill our frame before we can even confirm it was stored!
      // So we check if we got the response while the store was happening.
      // If not we register for the inbound frame as you'd expect.
      const earlyResp = this.service.serviceMgmt.unmappedResponses.get(newDoc.path);
      if (earlyResp) {
        this.service.serviceMgmt.unmappedResponses.delete(newDoc.path);
        clearTimeout(timeout);
        resolve(earlyResp);
      } else {
        this.service.serviceMgmt.frameListeners.set(newDoc.path, function (x) {
          clearTimeout(timeout);
          resolve(x);
        });
      }
    });

    return this.decodeOutput({
      ...response,
      Output: JSON.parse(response.Output),
    });
  }

}


const frameCollSpecPromise = (async () => {
  // load all the application schema models
  const {Compiler, Elements} = process.env.USING_BABEL
    ? require('@dustjs/data-tree')
    : await import('@dustjs/data-tree');

  const frameCollSchema = new Elements.Collection({
    '/origin': {
      '/date': Date,
      '/hostname': String,
      '/wants-response': Boolean,
    },
    '/fulfilled': {
      '/date': Date,
      '/hostname': String,
    },
    '/request': {
      '/Input': String,
      '/Op': String,
      '/Path': String,
      '/Dest': String,
      '/Depth': Number,
    },
    '/response': {
      '/Ok': Boolean,
      '/Output': String,
    },
    '/state': String,
  });

  const compiler = new Compiler({
    target: 'firestore',
  });
  const frameCollSpec = compiler.mapChildSpec(frameCollSchema);
  console.log('Compiled frame collection spec');
  return frameCollSpec;
})();


module.exports = {
  ServiceMgmt,
  UserServicesMgmt,
  UserService,
};
