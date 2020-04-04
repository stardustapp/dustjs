// TODO: rename RawLocalStore, local.js
class RawVolatileStore extends BaseBackend {
  constructor(opts) {
    super(opts);

    this.nodeMap = new Map;
    this.edgeMap = new Map;
  }

  putNode(nodeId, type, recordData) {
    const node = new StoreNode(this.storeId, {nodeId, type}, recordData);
    node.recordData = node.cloneData(); // extra safety
    this.nodeMap.set(node.identify(), node);
  }
  fetchNode(nodeId) {
    if (this.nodeMap.has(nodeId)) {
      return this.nodeMap.get(nodeId).clone();
    } else {
      return null;
    }
  }

  putEdge(triple, recordData) {
    const edge = new StoreEdge(this.storeId, triple, recordData);
    edge.recordData = edge.cloneData(); // extra safety
    this.edgeMap.set(edge.identify(), edge);
  }
  fetchEdge(specifier) {
    const key = StoreEdge.identify(specifier);
    if (this.edgeMap.has(key)) {
      return this.edgeMap.get(key).clone();
    } else {
      return null;
    }
  }
  queryEdges(query) {
    const matches = new Array;
    for (const edge of this.edgeMap.values()) {
      if (edge.predicate !== query.predicate) continue;
      if (query.subject && edge.subject !== query.subject) continue;
      if (query.object && edge.object !== query.object) continue;
      matches.push(edge.clone());
    }
    console.log('Volatile query matched', matches.length,
      'of', this.edgeMap.size, 'edgeMap');
    return matches;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    RawVolatileStore,
  };
}
