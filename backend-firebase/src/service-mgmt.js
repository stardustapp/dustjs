const {Datadog} = require('./lib/datadog.js');
const {AsyncCache} = require('./lib/async-cache.js');
const {
  PathFragment,
  SkylinkServer, SkylinkClientEntry,
} = require('@dustjs/skylink');

const myHostname = require('os').hostname();

class ServiceMgmt {
  constructor(firestore) {
    this.frameListeners = new Map;

    this.readyFrames = firestore
      .collectionGroup('frames')
      .where('origin.hostname', '==', myHostname)
      .orderBy('fulfilled.date');

    this.stopSnapsCb = this.readyFrames.onSnapshot(async querySnap => {
      for (const docChange of querySnap.docChanges()) {
        if (docChange.type !== 'added') continue;
        Datadog.countFireOp('read', docChange.doc.ref, {fire_op: 'watched', method: 'services/readyFrames'});

        console.log('received ready frame', docChange.doc.get('request.Op'), '- ok', docChange.doc.get('response.Ok'));

        const listener = this.frameListeners.get(docChange.doc.ref.path);
        console.log('ready frame listener:', listener);
        if (listener) {
          listener(docChange.doc.get('response'));
          this.frameListeners.delete(docChange.doc.ref.path);
        }

        Datadog.countFireOp('write', docChange.doc.ref, {fire_op: 'delete', method: 'services/readyFrames'});
        await docChange.doc.ref.delete();
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

    // TODO: subscribe to the root entry and shut down if our sub stops
    // (await deviceEntry.getEntry('/')).subscribe(...)

    await this.collRef
      .doc(serviceId)
      .set({
        apiHostname: myHostname,
        lastMounted: new Date,
        // serviceUri: 'todo://',
        canFireProxy: true,
      });
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
  }
  configure(docSnap) {
    console.log('configuring svc', this.docRef.path, 'for hostname', docSnap.get('apiHostname'));
    this.latestSnap = docSnap.data();

    // set up observing if it's us
    if (docSnap.get('apiHostname') === myHostname && docSnap.get('canFireProxy')) {
      if (this.stopListening) return;
      console.log('service-mgmt starting listener for', this.docRef.path);
      this.stopListening = this.docRef
        .collection('frames')
        .where('state', '==', 'Waiting')
        .limit(5)
        .onSnapshot(async querySnap => {
          for (const docChange of querySnap.docChanges()) {
            Datadog.countFireOp('read', docChange.doc.ref, {fire_op: 'watched', method: 'services/waitingFrames'});
            if (docChange.type !== 'added') continue;

            console.log('received waiting frame', docChange.doc.get('request.Op'));

            let response = {
              Ok: false,
            };

            const endpoint = this.localEndpoints.get(this.svcId);
            if (endpoint) {
              const fireRequest = docChange.doc.get('request');

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

            Datadog.countFireOp('write', docChange.doc.ref, {fire_op: 'merge', method: 'services/waitingFrames'});
            await docChange.doc.ref.set({
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
        });
    } else if (this.stopListening) {
      console.log('service-mgmt stopping listener for', this.docRef.path);
      this.stopListening();
      this.stopListening = null;
    }
  }
  getEntry(path) {
    if (this.latestSnap.apiHostname === myHostname) {
      const endpoint = this.localEndpoints.get(this.svcId);
      if (endpoint) {
        return endpoint.getEntry(path);
      } else {
        console.error(`WARN: we're supposed to have "${this.docRef.path}" locally but I don't have it`);
      }
    } else if (this.latestSnap.canFireProxy) {
      return new SkylinkClientEntry(this, path);
    }
  }

  // API used to issue Skylink requests
  async volley(request) {
    // TODO: try talking directly over HTTP before falling back to fireproxy

    const frameCollRef = this.docRef.collection('frames');
    Datadog.countFireOp('write', frameCollRef, {fire_op: 'add', method: 'service/request'});
    console.log(request)
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
        Datadog.count('service.timeout', 1, {service_id: this.svcId});
        reject(new Error(`UserService#volley times out at 5 seconds`));
      }, 5000);
      this.serviceMgmt.frameListeners.set(newDoc.path, function (x) {
        clearTimeout(timeout);
        resolve(x);
      });
    });

    return {
      ...response,
      Output: JSON.parse(response.Output),
    };
  }

}

module.exports = {
  ServiceMgmt,
  UserServicesMgmt,
  UserService,
};
