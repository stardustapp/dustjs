// DEAD. TODO: REVIVE.

class IdbGraphStore {
  constructor(opts={}) {
    this.opts = opts;

    // database
    this.idb = null;
    this.graphs = new Map;
    this.objects = new Map;
    // records and events are kept cold by default

    // transaction state
    this.readyForTxn = false;
    this.waitingTxns = new Array;
    this.eventProcessors = new Array;

    this.ready = this.start();

    // TODO
    self.gs = this;
    this.warnInterval = setInterval(() => {
      if (this.waitingTxns.length) {
        console.warn('IdbGraphStore has', this.waitingTxns.length, 'waiting transactions');
      }
    }, 1000);
  }

  async migrateIdb(upgradeDB) {
    // this switch intentionally falls through every case.
    // it allows for each case to build on the previous.
    switch (upgradeDB.oldVersion) {
      case 0:
        const graphs = upgradeDB.createObjectStore('graphs', { keyPath: 'graphId' });
        const objects = upgradeDB.createObjectStore('objects', { keyPath: 'objectId' });
        objects.createIndex('by graph', 'graphId', { multiEntry: true });
        objects.createIndex('referenced', 'refObjIds', { multiEntry: true });
        objects.createIndex('by parent', ['parentObjId', 'name'], { unique: true });
        const records = upgradeDB.createObjectStore('records', { keyPath: ['objectId', 'recordId'] });
        records.createIndex('by path', 'path', { unique: true });
        const events = upgradeDB.createObjectStore('events', { keyPath: ['graphId', 'timestamp'] });
    }
  }

  async start() {
    // open IDB
    const idbName = this.opts.idbName || 'graph-worker';
    this.idb = await idb.open(idbName, 1, this.migrateIdb.bind(this));
    console.debug('Opened IDB');

    // load working dataset
    const idbTx = this.idb.transaction(['graphs', 'objects']);
    const allGraphs = await idbTx.objectStore('graphs').getAll();
    for (const graphData of allGraphs) {
      const graph = new Graph(this, graphData);
      this.graphs.set(graphData.graphId, graph);

      // fetch all the objects
      const objects = await idbTx
        .objectStore('objects').index('by graph')
        .getAll(graphData.graphId);

      // construct the objects
      for (const objData of objects) {
        graph.populateObject(objData);
      }

      graph.relink();
    }
    console.debug('Loaded', this.graphs.size, 'graphs containing', this.objects.size, 'objects');

    // open up shop
    this.readyForTxn = true;
    if (this.waitingTxns.length) {
      console.debug('Processing startup transactions...');
      await this.runWaitingTxns();
    }
  }

  // user entrypoint that either runs immediately or queues for later
  async transact(mode, cb) {
    if (this.readyForTxn) {
      try {
        this.readyForTxn = false;
        return await this.immediateTransact(mode, cb);
      } finally {
        this.readyForTxn = true;
        if (this.waitingTxns.length) {
          console.warn('Scheduling transactions that queued during failed immediate transact');
          setTimeout(this.runWaitingTxns.bind(this), 0);
        }
      }
    } else {
      return new Promise((resolve, reject) => {
        this.waitingTxns.push({
          mode, cb,
          out: {resolve, reject},
        });
      });
    }
  }

  // model entrypoint that runs everything that's waiting
  async runWaitingTxns() {
    if (!this.readyForTxn) throw new Error(`runWaitingTxns() ran when not actually ready`);
    try {
      this.readyForTxn = false;
      console.group('Processing all queued transactions');

      // process until there's nothing left
      while (this.waitingTxns.length) {
        const {mode, cb, out} = this.waitingTxns.shift();

        // pipe result to the original
        const txnPromise = this.immediateTransact(mode, cb);
        txnPromise.then(out.resolve, out.reject);
        await txnPromise;
      }

    } finally {
      this.readyForTxn = true;
      console.groupEnd();
    }
  }

  async immediateTransact(mode='readonly', cb) {
    const idbTx = this.idb.transaction(['graphs', 'objects', 'records', 'events'], mode);
    console.group(`${mode} graph transaction`);

    try {
      const txn = new GraphTxn(this, idbTx, mode);
      const result = await cb(txn);
      await txn.finish();
      return result;

    } catch (err) {
      if (idbTx.error) {
        console.warn('IDB transaction failed:', idbTx.error);
        throw idbTx.error;
      }
      console.error('GraphTxn crash:', err);
      console.warn('Aborting IDB transaction due to', err.name);
      idbTx.abort();
      throw err;//new Error(`GraphTxn rolled back due to ${err.stack.split('\n')[0]}`);

    } finally {
      console.groupEnd();
    }
  }

  /*
  async close() {
    this.transact('readonly', async txn => {
      clearInterval(this.warnInterval);
      console.warn('Closing IDB');
      const shutdown = this.idb.close();
      this.idb = null;
      await shutdown;
    });
  }
  */

  async processEvent(event) {
    const {timestamp, graphId, entries} = event;
    let graph = this.graphs.get(graphId);

    // TODO
    //for (const processor of eventProcessors) {
    //  processor(graph, event);
    //}

    for (const entry of entries) {
      switch (entry.type) {

        case 'delete everything':
          // TODO: graceful shutdown?
          this.graphs = new Map;
          this.objects = new Map;
          break;

        case 'delete graph':
          throw new Error('@#TODO DELETE GRAPH');

        case 'create graph':
          if (graph) throw new Error(
            `DESYNC: graph double create`);
          if (this.graphs.has(graphId)) throw new Error(
            `DESYNC: graph ${graphId} already registered`);
          graph = new Graph(this, entry.data);
          this.graphs.set(graphId, graph);
          break;

        //case 'update graph':
          // TODO: event specifies new 'fields' and 'version'
          //break;

        case 'create object':
          graph.populateObject(entry.data);
          break;

        default:
          console.warn('"processing"', graphId, 'event', entry.type, entry.data);
      }
    }
    if (graph) graph.relink();
  }

  async findGraph({engine, engineKey, fields}) {
    await this.ready;

    const targetEngine = engine ? engine.engineKey : engineKey;
    return Array
      .from(this.graphs.values())
      .filter(x => x.data.engine === targetEngine)
      .find(x => Object.keys(fields)
        .every(key => x.data.fields[key] == fields[key]));
  }

  async findOrCreateGraph(engine, {selector, fields, buildCb}) {
    await this.ready;

    // return an existing graph if we find it
    const existingGraph = await this.findGraph({
      engine,
      fields: selector || fields,
    });
    if (existingGraph) return existingGraph;

    // ok we have to build the graph
    const graphBuilder = await buildCb(engine, fields);
    if (!graphBuilder) throw new Error(
      `Graph builder for ${engine.engineKey} returned nothing`);

    // persist the new graph
    const graphId = await this
      .transact('readwrite', async txn => {
        //await txn.purgeGraph(appId);
        const graphId = await txn.createGraph({engine, fields});
        await txn.createObjectTree(graphId, graphBuilder.rootNode);
        return graphId;
      });
    console.debug('Created graph', graphId, 'for', fields);

    // grab the [hopefully] loaded graph
    if (!this.graphs.has(graphId)) throw new Error(
      `Graph ${graphId} wasn't loaded after creation`);
    return this.graphs.get(graphId);
  }

  getGraphsUsingEngine(engineKey) {
    return Array
      .from(this.graphs.values())
      .filter(x => x.data.engine === engineKey);
  }
}

class IdbDataContext {
  constructor(graphStore, txn) {
    this.graphStore = graphStore;
    this.txn = txn;

    this.currentDate = new Date;
    this.graphActions = new Map;

    txn.complete.then(
      this._onComplete.bind(this),
      this._onError.bind(this));
  }

  _addAction(graphId, ...actions) {
    if (!this.graphActions) {
      console.warn('Prior finish call:', this.finishStack)
      throw new Error(`DESYNC: IdbDataContext use-after-completion`);
    }
    if (!this.graphActions.has(graphId)) {
      this.graphActions.set(graphId, new Array);
    }

    const entries = this.graphActions.get(graphId);
    actions.forEach(x => entries.push(x));
  }

  _onComplete() {
    if (this.graphActions) {
      console.warn(`DESYNC: IdbDataContext didn't have a chance to commit its actions`, this.graphActions);
      throw new Error(`DESYNC: No IdbDataContext Completion`);
    }
  }

  _onError(err) {
    // error is null if aborted
    if (err) console.error(
      `IdbDataContext failed:`, err.constructor, err.code, err.name);
  }


  async purgeGraph(graphId) {
    const ops = [
      this.txn.objectStore('graphs').delete(graphId),
      this.txn.objectStore('events').delete(IDBKeyRange.bound([graphId, new Date(0)], [graphId, new Date(1e13)])),
    ];

    const objStore = this.txn.objectStore('objects');
    const recStore = this.txn.objectStore('records');

    const objIds = await objStore
      .index('by graph').getAllKeys(graphId);
    if (!objIds.length) return;
    console.warn('Objects to delete:', objIds);

    const brokenObjIds = new Set;
    for (const objectId of objIds) {
      const depObjIds = await objStore.index('referenced').getAllKeys(objectId);
      depObjIds
        .filter(x => !objIds.includes(x))
        .filter(x => !brokenObjIds.has(x))
        .forEach(depId => {
          console.warn('Breaking object reference from', depId, 'to', objId);
          brokenObjIds.add(depId);
        });

      ops.push(
        objStore.delete(objectId),
        recStore.delete(IDBKeyRange.bound([objectId, '#'], [objectId, '~'])),
      );
    }
    console.log('Deleted', objIds.length, 'objects, breaking', brokenObjIds.size, 'other objects')

    await Promise.all(ops);
    this._addAction(graphId, {
      type: 'delete graph',
    });
  }

  async purgeEverything() {
    await this.txn.objectStore('graphs').clear();
    await this.txn.objectStore('objects').clear();
    await this.txn.objectStore('records').clear();
    await this.txn.objectStore('events').clear();

    this._addAction(null, {
      type: 'delete everything',
    });
  }

  async createGraph(options={}) {
    const graphId = options.forceId || randomString(3);

    // check for conflict
    const existingDoc = await this.txn.objectStore('graphs').get(graphId);
    if (existingDoc) throw new Error(
      `Graph ID '${graphId}' already exists`);
    // TODO: check for existing objects

    // write out the graph itself
    const record = {
      graphId,
      version: 1,
      engine: options.engine.engineKey,
      fields: options.fields,
      createdAt: this.currentDate,
      updatedAt: this.currentDate,
    };
    await this.txn.objectStore('graphs').add(record);

    // seed the events
    this._addAction(graphId, {
      type: 'create graph',
      data: record,
    });

    return graphId;
  }

  async createObjectTree(graphId, rootNode) {
    const nodes = [];
    function addNode(node) {
      nodes.push(node);
      if (node.names) {
        Array
          .from(node.names.values())
          .forEach(addNode);
      }
    }
    addNode(rootNode);
    return this.createObjects(graphId, nodes);
  }

  async createObjects(graphId, objects) {
    if (!objects.every(x => x))
      throw new Error(`createObjects() was given falsey object`);
    if (!objects.every(x => x.constructor === GraphBuilderNode))
      throw new Error(`createObjects() was given something other than GraphBuilderNode`);

    const actions = [];
    const readyObjs = new Map;
    const remaining = new Set(objects);

    function prepareObject(object) {
      const objectId = randomString(3);
      const {type, parent, name, version, data} = object;

      if (parent) {
        if (!readyObjs.has(parent)) {
          console.info('Object', name, 'is missing its parent', parent);
          return false;
        }
      }

      const refObjIds = new Set;
      const missingRefs = new Set;
      function resolveRef(ref) {
        let {target} = ref;
        if (target.constructor === GraphGhostNode) {
          if (target.parent.names.has(target.childName)) {
            target = target.parent.names.get(target.childName);
          }
        }
        if (target.constructor === GraphBuilderNode) {
          if (readyObjs.has(target)) {
            const objId = readyObjs.get(target);
            refObjIds.add(objId);
            return objId;
          }
        } else if (GraphObject.prototype.isPrototypeOf(target)) {
          return target.data.objectId;
        } else if (target.constructor === String) {
          // TODO: better path resolving strategy
          const newTarget = Array
            .from(readyObjs.entries())
            .find(x => x[0].name === target);
          if (newTarget) {
            const objId = target[1];
            refObjIds.add(objId);
            return objId;
          }
        }

        console.debug('Reference for', ref, 'missing.', target);
        missingRefs.add(ref);
        return false;
      }

      const primitives = new Set([String, Date, Array, Boolean, Number, Blob]);
      function cleanValue(val) {
        if (val == null) {
          return null;
        } else if (val.constructor === Object) {
          const output = {};
          Object.keys(val).forEach(key => {
            // reserving this shouldn't hurt
            if (key.startsWith('$')) throw new Error(
              `Data keys cannot start with $`);
            output[key] = cleanValue(val[key]);
          });
          return output;
        } else if (val.constructor === Array) {
          return val.map(cleanValue);
        } else if (val.constructor === GraphReference) {
          return resolveRef(val);
        } else if (primitives.has(val.constructor)) {
          return val;
        } else {
          throw new Error(`Object ${name} had data field with ${val.constructor.name} type`);
        }
      }

      const cleanedData = cleanValue(data);
      if (missingRefs.size > 0) {
        console.info('Object', name, 'is missing', missingRefs.size, 'refs.', data);
        return false;
      }

      return {
        graphId,
        objectId,
        refObjIds: Array.from(refObjIds),
        parentObjId: parent ? readyObjs.get(parent) : null,
        name,
        type,
        version,
        fields: cleanedData,
      };
    }

    let pass = 0;
    while (remaining.size && pass++ < 5) {
      console.group('Object linking pass', pass);
      try {
        let compiled = 0;

        for (const object of objects) {
          if (readyObjs.has(object)) continue;
          const record = prepareObject(object);
          if (!record) continue;

          //console.log('storing', record);
          await this.txn.objectStore('objects').add(record);

          this._addAction(graphId, {
            type: 'create object',
            data: record,
          });

          readyObjs.set(object, record.objectId);
          remaining.delete(object);
          compiled++;
        }

        console.log('Completed', compiled, 'objects in pass', pass);
      } finally {
        console.groupEnd();
      }
    }

    if (remaining.size > 0) throw new Error(
      `${remaining.size} objects failed to link after ${pass} passes.`);

    console.log('Stored', readyObjs.size, 'objects');
  }

  async replaceFields(objectId, version, newFields) {
    const object = this.txn.objectStore('objects').get(objectId);
    const {graphId} = object.data;

    if (object.data.version !== version) throw new Error(
      `CONFLICT: You committed from version ${field.version}, but version ${object.data.version} is latest`);
    version += 1;

    this._addAction(graphId, {
      type: 'replace object fields',
      graphId, objectId, version,
      fields: newFields,
    });
  }

  async finish() {
    // create the necesary events
    const events = Array
      .from(this.graphActions.entries())
      .map(([graphId, entries]) => ({
        timestamp: this.currentDate,
        graphId, entries,
      }));
    this.graphActions = null;

    // record a stack trace for debugging txns
    try {
      throw new Error('finishing IdbDataContext');
    } catch (err) {
      this.finishStack = err;
    }

    console.log('events:', events);
    // store the events
    const eventStore = this.txn.objectStore('events');
    const ops = events
      .filter(doc => doc.graphId) // ignore runtime global events
      .map(doc => eventStore.add(doc));

    // wait for transaction to actually commit
    await Promise.all(ops);
    await this.txn.complete;

    // pass events into the reactivity engine
    // this is a bad time to fail!
    for (const event of events) {
      try {
        await this.graphStore.processEvent(event);
      } catch (err) {
        console.error(`DESYNC: Event failed to process.`, event, err);
      }
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    IdbGraphStore,
    IdbDataContext,
  };
}
