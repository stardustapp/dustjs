let NextStoreNumber = 1;
const OpenStores = new Map;

class StoreRecord {
  constructor(storeId, specifiers, recordData=null) {
    this.storeId = storeId;
    this.specifiers = specifiers;
    this.recordData = recordData;
    //this.extraArgs = extra;

    // basically, use 'await' when possible to support async reading
    // just one thing needs to await then the data is available sync :)
    // promises will only be added at all when necesary, best-effort
    if (!this.isLoaded) {
      this.recordData.then(newData => {
        this.recordData = newData;
      });
    }
  }
  get isLoaded() {
    return this.recordData == null || typeof this.recordData.then !== 'function'
  }
  cloneData() {
    return this.isLoaded
      ? JSON.parse(JSON.stringify(this.recordData))
      : this.recordData.then(latest =>
        JSON.parse(JSON.stringify(latest)));
  }
  clone() {
    return new this.constructor(this.storeId, this.specifiers, this.cloneData());
  }
}
class StoreNode extends StoreRecord {
  constructor(storeId, {nodeId, type}, recordData) {
    super(storeId, {nodeId, type}, recordData);
    this.nodeId = nodeId;
    this.typeName = type;
  }
  identify() {
    return StoreNode.identify(this.specifiers);
  }
  static identify({nodeId}) {
    return nodeId;
  }
  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    const prefix = ' '.repeat(options.indentationLvl);
    const header = `StoreNode [ ${this.typeName} id '${this.nodeId}' store#${this.storeId} ]`;
    return header+' '+JSON
      .stringify(this.recordData, null, 2)
      .split('\n').join('\n'+prefix);
  }
}
class StoreEdge extends StoreRecord {
  constructor(storeId, {subject, predicate, object}, recordData) {
    super(storeId, {subject, predicate, object}, recordData);
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
  }
  identify() {
    return StoreEdge.identify(this.specifiers);
  }
  static identify({subject, predicate, object}) {
    return [subject, predicate, object].map(encodeURI).join('|');
  }
}

class BaseBackend {
  static allOpenStores() { return OpenStores.values(); }
  static deleteStore(id) { OpenStores.delete(id); }
  static forId(id) { return OpenStores.get(id); }
  constructor(opts) {
    this.engine = opts.engine || GraphEngine.get(opts.engineKey);

    this.storeId = NextStoreNumber++;
    OpenStores.set(this.storeId, this);

    this.accessors = new Map;
    for (const name of this.engine.names.values()) {
      this.accessors.set(name.name, FieldAccessor.forType(name));
    }

    this.mutex = new RunnableMutex((mode, cb) => cb(this));
    this.transactRaw = this.mutex.submit.bind(this.mutex);

    //this.rootContext = this.newContext();
  }

  describe() {
    return `${this.engine.engineKey}`;
  }

  newContext() {
    return new GraphContext({
      storeId: this.storeId,
      engine: this.engine,
      txnSource: this.transactRaw,
    });
  }

  // builds a graph context and runs the code within it
  // not exclusive lock, no mutex, but will flush out when you return
  async transactGraph(cb) {
    const graphCtx = this.newContext();
    const output = await cb(graphCtx);
    await graphCtx.flush();
    return output;
  }

  freeStore() {
    //console.log('Freeing store #', this.storeId);
    if (!OpenStores.has(this.storeId)) throw new Error(
      `BaseBackend #${this.storeId} double-free`);

    for (const context of GraphContext.allOpenContexts()) {
      if (context.storeId === this.storeId) {
        context.freeContext();
      }
    }

    OpenStores.delete(this.storeId);
    this.mutex.stop();
    //console.log('Eradicated store #', this.storeId);
  }

  execActionBatch(actions) {
    return Promise.all(actions.map(({kind, record}) => {
      switch (kind) {

        case 'put node':
          return this.putNode(record.nodeId, record.typeName, record.recordData);
          //console.log(`stored node '${record.nodeId}'`);
          break;

        case 'put edge':
          return this.putEdge(record, record.data);
          //console.log(`stored ${record.predicate} edge`);
          break;

        default: throw new Error(
          `${this.constructor.name} got weird action kind '${kind}'`);
      }
    }));
    //console.debug('Volatile store processed', kind, 'event');
  }

  // async getNodeById(nodeId, graphCtx) {
  //   const record = await this.loadNodeById(nodeId); // from raw impl
  //   const accessor = this.accessors.get(record.nodeType);
  //   if (!accessor) throw new Error(
  //     `Didn't find an accessor for type ${record.nodeType}`);
  //
  //   const obj = new GraphNode(graphCtx, nodeId, record.nodeType);
  //   return accessor.mapOut({nodeId, ...record}, graphCtx, obj);
  // }
}

if (typeof module !== 'undefined') {
  module.exports = {
    StoreRecord,
    StoreNode,
    StoreEdge,
    BaseBackend,
  };
}
