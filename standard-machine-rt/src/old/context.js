let NextContextNumber = 1;
const OpenContexts = new Map;

class GraphNode {
  constructor(ctxId, nodeId, nodeType) {
    this.ctxId = ctxId;
    this.nodeId = nodeId;
    this.nodeType = nodeType;
    if (!ctxId) throw new Error(`GraphNodes needs ctxId`);
    if (!nodeId) throw new Error(`GraphNodes needs nodeId`);
    if (!nodeType) throw new Error(`GraphNodes needs nodeType`);
    this.isDirty = false;
  }
  markDirty() {
    this.isDirty = true;
  }
  flush() {
    this.isDirty = false;
  }
  getGraphCtx() {
    return OpenContexts.get(this.ctxId);
  }
  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    //console.log('opts', options)
    const prefix = ' '.repeat(options.indentationLvl);
    const header = `GraphNode [ ${this.nodeType} id '${this.nodeId}' ctxId ${this.ctxId} ]`;
    const storedNode = OpenContexts.get(this.ctxId).storedNodes.peek(this.nodeId);
    if (storedNode) {
      //console.log('node inspect', storedNode)
      return header+' '+JSON
        .stringify(storedNode.recordData, null, 2)
        .split('\n').join('\n'+prefix);
    } else {
      const stackLines = new Error().stack.split('\n').slice(4); // skip custom inspect lines
      const firstRealLine = stackLines.findIndex(line => line.includes(' (/'));
      if (firstRealLine >= 0) stackLines.splice(0, firstRealLine);
      return [ header,
        prefix+`WARN: inspected node that the context didn't have stored!`,
        ...stackLines.map(x => `${prefix}x`),
      ].join('\n');
    }
  }
}
class GraphEdge {
  constructor(ctxId, {subject, predicate, object}) {
    this.ctxId = ctxId;
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.isDirty = false;
  }
  markDirty() {
    this.isDirty = true;
  }
  flush() {
    this.isDirty = false;
  }
  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    //console.log('opts', options)
    const prefix = ' '.repeat(options.indentationLvl);
    return `GraphEdge [ ${this.subject} ${this.predicate} ${this.object} ctxId ${this.ctxId} ]`;
    // TODO: include edge data
  }
}

class GraphContext {
  static allOpenContexts() { return OpenContexts.values(); }
  static deleteContext(id) { OpenContexts.delete(id); }
  static forId(id) { return OpenContexts.get(id); }
  constructor({storeId, engine, txnSource}) {
    // NOTE: this.engine is also referenced by accessors
    this.engine = engine;
    this.txnSource = txnSource;
    if (!(this.storeId = storeId)) throw new Error(
      `Store ID is required by GraphContext`);

    this.ctxId = NextContextNumber++;
    OpenContexts.set(this.ctxId, this);

    console.log('Created', this.constructor.name, this.ctxId, 'for', engine.engineKey, 'store #', storeId);
    //PrintCallSite();

    this.graphNodes = new LoaderCache(
      this.loadGraphNode.bind(this),
      this.ensureNodeId.bind(this));
    this.storedNodes = new LoaderCache(
      this.loadStoreNode.bind(this),
      this.ensureNodeId.bind(this));

    this.graphEdges = new LoaderCache(
      this.loadGraphEdge.bind(this),
      this.identifyEdge.bind(this));
    this.storedEdges = new LoaderCache(
      this.loadStoreEdge.bind(this));
    this.edgeQueryCache = new LoaderCache(
      this.queryStoreEdges.bind(this),
      this.identifyEdge.bind(this));

    this.topAccessor = FieldAccessor
      .forType(engine.topType);
  }

  ensureNodeId(id) {
    if (id.constructor !== String) throw new Error(
      `ensureNodeId() needs String`);
    if (id.includes('#')) throw new Error(
      `ensureNodeId() can't accept scoped IDs yet (TODO)`);
    return id;
  }
  async loadGraphNode(nodeId) {
    const {stack} = new Error;
    const storeNode = await this.storedNodes.get(nodeId);
    if (storeNode == null) {
      const err = new Error(`StoreNode ${nodeId} Not Found in GraphContext #${this.ctxId}`);
      err.status = 404;
      err.stack = [err.stack.split('\n')[0], ...stack.split('\n').slice(1)].join('\n');
      throw err;
    }
    //console.log('raw node:', nodeId, storeNode);

    try {
      const accessor = FieldAccessor
        .forType(this.engine
          .names.get(storeNode.typeName));
      const node = accessor.mapOut(storeNode, this);

      // optionally run startup code
      if (typeof node.setup === 'function') {
        this.graphNodes.set(nodeId, node);
        // TODO: seed this properly before calling setup (loadercache feature?)
        //node.ready = node.setup();
        await node.setup();
      }

      return node;

    } catch (err) {
      err.stack = [
        ...err.stack.split('\n'),
        '    -- via',
        ...stack.split('\n').slice(2),
      ].join('\n');
      throw err;
    }
  }
  loadStoreNode(nodeId) {
    return this
      .txnSource('get node', dbCtx =>
        dbCtx.fetchNode(nodeId));
  }

  identifyEdge(edge) {
    if (edge.constructor === GraphEdge) {
      if (edge.ctxId !== this.ctxId) throw new Error(
        `GraphContext #${this.ctxId} can't identify edge from another GraphContext #${edge.ctxId}`);
    } else if (edge.constructor === StoreEdge) {
      if (edge.storeId !== this.storeId) throw new Error(
        `Refusing to identify edge from another GraphBackend`);
    } else if (edge.constructor !== Object) throw new Error(
      `Cannot identify edge of type ${edge.constructor.name}`);
    //console.log('identifying edge', edge)
    return [
      edge.subject ? edge.subject : (edge.subjectType ? `${edge.subjectType}#` : null),
      edge.predicate,
      edge.object ? edge.object : (edge.objectType ? `${edge.objectType}#` : null),
    ].map(encodeURI).join('|');
  }
  async loadGraphEdge(query, edgeString) {
    console.log('loadGraphEdge', edgeString, query);
    throw new Error('todo aa235890ag');
  }
  loadStoreEdge(edgeString) {
    return this.txnSource('get edge', async dbCtx => {
      const edges = await dbCtx.fetchEdge(edge);
      if (edges.length > 0) return edges[0];
      throw new Error(`Edge Not Found`);
    });
  }

  async queryEdges(richQuery) {
    const edges = new Map;
    const addEdge = record => {
      edges.set(this.identifyEdge(record), record);
    }

    const {subject, object, ...others} = richQuery;
    const query = {
      subject: subject ? this.identifyNode(subject) : null,
      object: object ? this.identifyNode(object) : null,
      ...others,
    };
    //console.log('GraphContext querying edges with', query);
    //console.log('querying edge records using', this.allEdges.length, 'loaded edges');

    for (const edge of this.graphEdges.loadedEntities()) {
      if (edge.predicate !== query.predicate) continue;
      if (query.subject && edge.subject !== query.subject) continue;
      if (query.object && edge.object !== query.object) continue;
      if (query.objectType && edge.object.split('#')[0] !== query.objectType) continue;
      if (query.subjectType && edge.subject.split('#')[0] !== query.subjectType) continue;
      addEdge(edge);
    }

    // TODO: add edges from backing store
    const storeEdges = await this.edgeQueryCache.get(query);
    for (const storeEdge of storeEdges) {
      //console.log('adding store edges in query result', storeEdge);
      // const {subject, object, ...others} = storeEdge;
      // const query = {
      //   subject: subject ? this.identifyNode(subject) : null,
      //   object: object ? this.identifyNode(object) : null,
      //   ...others,
      // };
      addEdge(storeEdge); // TODO: why is this just a bare object?
      //throw new Error(`todo 2856hyuzkiliodtrhj`)
    }

    return Array.from(edges.values());
  }
  queryStoreEdges(query) {
    //console.log('queryStoreEdges', query);
    return this
      .txnSource('query edges',
        dbCtx => dbCtx.queryEdges(query));
  }

  flush() {
    return this.txnSource('flush context', async dbCtx => {
      await this.buildNodeRefs(); // TODO: shuold be done on-reference instead
      const stats = await Promise.all([
        this.flushNodes(dbCtx),
        this.flushEdges(dbCtx),
      ]);
      console.log(`Flushed ${dbCtx.constructor.name} GraphContext:`, stats.join(', '));
      this.flushRefMapper = null;
    });
  }

  async buildNodeRefs() {
    for (const node of this.graphNodes.loadedEntities()) {
      if (!node.isDirty) continue;
      const accessor = FieldAccessor.forType(this.engine.names.get(node.nodeType));

      const refs = new Set;
      //console.log('gathering refs from', node);
      accessor.gatherRefs(node, refs, this);
      for (const desiredObj of refs) {
        // TODO: check if this.allEdges already has the ref edge
        await this.newEdge({
          subject: node,
          predicate: 'REFERENCES',
          object: desiredObj,
        });
      }
    }
  }

  async flushNodes(dbCtx) {
    const actions = Array
      .from(this.graphNodes.loadedEntities())
      .filter(node => node.isDirty)
      .map(node => ({
        kind: 'put node',
        nodeId: node.nodeId,
        record: this.storedNodes.peek(node.nodeId),
      }));

    await this
      .txnSource('flush nodes', dbCtx =>
        dbCtx.execActionBatch(actions));

    this.graphNodes.clearAll();
    this.storedNodes.clearAll();
    return `${actions.length} nodes`;
  }

  async flushEdges(dbCtx) {
    const actions = Array
      .from(this.graphEdges.loadedEntities())
      .filter(edge => edge.isDirty)
      .map(edge => ({
        kind: 'put edge',
        record: edge, // this.storedEdges.peek(edge),
      }));

    await this
      .txnSource('flush actions', dbCtx =>
        dbCtx.execActionBatch(actions));

    this.graphEdges.clearAll();
    this.storedEdges.clearAll();
    this.edgeQueryCache.clearAll();
    return `${actions.length} edges`;
  }

  countDirty() {
    const dirtyEdges = Array
      .from(this.graphEdges.loadedEntities())
      .filter(edge => edge.isDirty);
    const dirtyNodes = Array
      .from(this.graphNodes.loadedEntities())
      .filter(node => node.isDirty);
    return [
      dirtyEdges.length && `${dirtyEdges.length} dirty edges: ${dirtyEdges.map(x=>this.identifyEdge(x)).join(', ')}`,
      dirtyNodes.length && `${dirtyNodes.length} dirty nodes: ${dirtyNodes.map(x=>this.identifyNode(x)).join(', ')}`,
    ].filter(x => x).join(', ');
  }

  findNodeBuilder(path) {
    if (this.engine.names.has(path))
      return this.engine.names.get(path);
    console.log('finding type', path, 'from', this.engine);
    throw new Error('findType() TODO');
  }
  findNodeAccessor(path) {
    return FieldAccessor.forType(this
      .findNodeBuilder(path));
  }

  // Identifiers of format `nodeType#nodeId`
  identifyNode(node) {
    if (!node.nodeId || !node.nodeType) throw new Error(
      `GraphContext#identifyNode requires a node with a nodeId and nodeType`);
    if (node.ctxId === this.ctxId)
      return `${node.nodeType}#${node.nodeId}`;
    const foreignCtx = GraphContext.forId(node.ctxId);
    console.debug(`GraphContext #${this.ctxId} asked to identify node from GraphContext #${foreignCtx.ctxId}`);
    return `@${node.ctxId}@${foreignCtx.identifyNode(node)}`;
  }
  getNodeByIdentity(ident) {
    if (ident.startsWith('@')) {
      const [ctxId, foreignIdent] = ident.slice(1).split('@');
      const foreignCtx = GraphContext.forId(parseInt(ctxId));
      return foreignCtx.getNodeByIdentity(foreignIdent);
    }
    const parts = ident.split('#');
    if (parts.length > 2) {
      const firstPart = parts.shift();
      console.log('the weird ident is', ident);
      throw new Error('hol up')
    }
    if (parts.length !== 2) throw new Error(
      `GraphContext #${this.ctxId} can only resolve two-part identities`);
    return this.getNodeById(parts[1]);
    // TODO? check for
  }

  getNodeById(nodeId) {
    return this.graphNodes.get(nodeId);
  }
  // getNodeFast(nodeType, nodeId) {
  //   if (this.loadingNodes.has(nodeId))
  //     return this.loadingNodes.get(nodeId);
  //
  //   const node = new GraphNode(this, nodeId, nodeType);
  //   this.loadingNodes.set(nodeId);
  //
  //   node.ready = this.txnSource('get node fast', dbCtx =>
  //     dbCtx.loadNodeData(node));
  //   return node;
  // }

  putNode(accessor, fields, nodeId) {
    if (!accessor || accessor.constructor !== NodeAccessor) throw new Error(
      `NodeAccessor instance is required for new nodes`);
    if (this.graphNodes.peek(nodeId)) throw new Error(
      `GraphNode collision in GraphContext #${this.ctxId}`);
    if (this.storedNodes.peek(nodeId)) throw new Error(
      `StoreNode collision in GraphContext #${this.ctxId}`);

    const type = accessor.typeName;
    //console.log('putNode', type, fields);
    const newRecord = new StoreNode('new', {nodeId, type}, {});
    this.storedNodes.set(nodeId, newRecord);

    const node = accessor.mapOut(newRecord, this);
    this.graphNodes.set(nodeId, node);

    const expectedFields = accessor.getKeySet();
    for (const key in fields) {
      if (expectedFields.has(key)) {
        expectedFields.delete(key);
        node[key] = fields[key];
      } else throw new Error(
        `Received unexpected field '${key}' for '${type}' node`);
    }
    for (const missingField of expectedFields) {
      node[missingField] = null;
    }

    // TODO: VALIDATE NODE

    node.markDirty();
    if (typeof node.setup === 'function')
      node.ready = node.setup();

    //console.log(node);
    //throw new Error('putnode')
    return node;
    //node.rawData = accessor.mapIn(fields, this, node);
    //accessor.mapOut(node.rawData, this, node); // redo the accessors
    //node.rawData = record.data;
    //node.markDirty();
    //console.log('context put node', this.identifyNode(node))
    //return accessor.mapOut(record, this, node);
  }

  newNode(accessor, fields) {
    const nodeId = randomString(3); // TODO: check for uniqueness
    //console.log('assigned new nodeId', nodeId);
    return this.putNode(accessor, fields, nodeId);
  }

  newTypedFields(typeName, fields) {
    const accessor = this.findNodeAccessor(typeName);
    if (!accessor) throw new Error(
      `no accessor for ${typeName}`);
    return this.newNode(accessor, fields);
  }

  // use this if there can't already be a top
  async newTopNode(fields) {
    const {stack} = new Error;
    try {
      await this.getNodeById('top');
      throw new Error(
        `Tried to create a second 'top' node in GraphContext #${this.ctxId}`);
    } catch (err) {
      if (err.status !== 404)
        throw err;
    }

    try {
      const node = this.putNode(this.topAccessor, fields, 'top');
      await node.ready;
      return node;
    } catch (err) {
      err.stack = [...err.stack.split('\n'), '---', ...stack.split('\n').slice(2)].join('\n');
      throw err;
    }
  }

  // use this to handle existing tops
  migrateTopNode(migrateCb) {
    return this
      .getNodeById('top')
      .catch(err => {
        if (err.status !== 404)
          throw err;
        return null;
      })
      .then(migrateCb)
      .then(newFields => this.getNodeById('top'));
  }

  newEdge({subject, predicate, object, ...extras}) {
    // validate/prepare subject
    if (!subject) throw new Error(`newEdge() requires 'subject'`);
    if (subject.constructor === GraphNode) {
      if (subject.ctxId !== this.ctxId) throw new Error('cross ctx subject')
      subject = this.identifyNode(subject);
    }
    if (subject.constructor !== String) throw new Error(
      `newEdge() wants a String for subject, got ${subject.constructor.name}`);

    // validate/prepare object
    if (!object) throw new Error(`newEdge() requires 'object'`);
    if (object.constructor === GraphNode) {
      if (object.ctxId === this.ctxId) {
        object = this.identifyNode(object);
      } else {
        const foreignCtx = GraphContext.forId(object.ctxId);
        console.log('local', this.constructor.name, this.ctxId, 'other', foreignCtx.constructor.name, object.ctxId);
        //throw new Error('cross ctx object')
        //if (foreignCtx.phyStoreId)
        object = foreignCtx.identifyNode(object);
      }
    }
    if (object.constructor !== String) throw new Error(
      `newEdge() wants a String for object, got ${object.constructor.name}`);

    // create the edge
    const edge = new GraphEdge(this.ctxId, {subject, predicate, object}, extras);
    edge.markDirty();
    this.graphEdges.set(StoreEdge.identify(edge), edge);

    // TODO: support uniqueBy by adding name to index
    // TODO: support count constraints
    // TODO: look up the opposite relation for constraints
  }

  queryGraph(query) {
    return new GraphEdgeQuery(this, query);
  }

  freeBackingStore() {
    return this
      .txnSource('free store', dbCtx =>
        dbCtx.freeStore());
  }
  freeContext() {
    //console.log('Freeing context', this.ctxId);
    if (!OpenContexts.has(this.ctxId)) throw new Error(
      `GraphContext #${this.ctxId} double-free`);
    OpenContexts.delete(this.ctxId);
  }
}

class GraphEdgeQuery {
  constructor(graphCtx, query) {
    this.graphCtx = graphCtx;
    //console.log('constructing GraphEdgeQuery', query);
    this.query = query;
    if (typeof query.subject === 'string') throw new Error('got a string subject')
    if (typeof query.object === 'string') throw new Error('got a string object')
      // subject: query.subject ? graphCtx.identifyNode(query.subject) : null,
      // predicate: query.predicate,
      // object: query.object ? graphCtx.identifyNode(query.object) : null,
    //console.log('building graph query for', this.query);
  }

  async fetchAll() {
    const edges = await this.graphCtx.queryEdges(this.query);
    const promises = edges.map(async raw => ({
      subject: await this.graphCtx.getNodeByIdentity(raw.subject),
      predicate: raw.predicate,
      object: await this.graphCtx.getNodeByIdentity(raw.object),
    }));
    return await Promise.all(promises);
  }
  async fetchSubjects() {
    const edges = await this.graphCtx.queryEdges(this.query);
    return await Promise.all(edges
      .map(raw => raw.subject)
      .map(id => this.graphCtx.getNodeByIdentity(id)));
  }
  async fetchObjects() {
    const edges = await this.graphCtx.queryEdges(this.query);
    return await Promise.all(edges
      .map(raw => raw.object)
      .map(id => this.graphCtx.getNodeByIdentity(id)));
  }

  async findOneObject(filter) {
    const objects = await this.fetchObjects();
    //console.log('filtering through', objects.length, 'objects');
    for (const object of objects) {
      let isMatch = true;
      for (const key in filter) {
        //console.log(key, object[key], filter[key]);
        if (object[key] !== filter[key])
          isMatch = false;
      }
      if (isMatch) {
        //console.log('found matching', object.nodeType, object.nodeId);
        return object;
      }
    }
    console.log('missed filter:', filter);
    throw new Error(`No matching edge found`);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphNode,
    GraphContext,
  };
}
