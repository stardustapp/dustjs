class Graph {
  constructor(store, data, engine) {
    this.data = data;

    engine = engine || GraphEngine.get(data.engine);
    Object.defineProperty(this, 'engine', { enumerable: false, value: engine });
    Object.defineProperty(this, 'store', { enumerable: false, value: store });

    this.objects = new Map;
    this.roots = new Set;
  }

  populateObject(data, type=null) {
    if (this.objects.has(data.nodeId)) throw new Error(
      `Graph ${this.data.graphId} already has object ${data.nodeId}`);
    if (this.store.objects.has(data.nodeId)) throw new Error(
      `Graph store already has object ${data.nodeId}`);

    const obj = this.engine.spawnObject(data, type);
    this.objects.set(data.nodeId, obj);
    this.store.objects.set(data.nodeId, obj);
    if (obj.type.relations || [].some(x => x.type === 'Top')) {
      this.roots.add(obj);
    }
    return obj;
  }

  relink() {
    for (const root of this.roots) {
      //console.log('relinking', root);
      // TODO
    }
  }

  selectNamed(name) {
    return Array
      .from(this.objects.values())
      .find(x => x.data.Name === name);
  }
  selectAllWithType(type) {
    return Array
      .from(this.objects.values())
      .filter(x => x.data.type === type);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    Graph,
  };
}
