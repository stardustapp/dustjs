class GraphBuilder {
  constructor(engine, topData) {
    this.store = RawVolatileStore.open(engine, topData);

    this.engine = engine;
    this.ghosts = new Set;

    //this.rootNode = this.store.rootNode;
/*
    for (const [name, part] of engine.names.entries()) {
      Object.defineProperty(this, `new${name}`, {
        value: function(objName, objVersion, opts) {
          // TODO: throw if not first root
          console.log('building', objName, objVersion, part.name, 'with', opts);
          const object = new GraphBuilderNode(this, null, objName, name, part, objVersion, opts);
          if (this.rootNode) throw new Error(`Graph already has a root node`);
          return this.rootNode = object;
        },
      });
    }
    */
  }

  getRoot() {
    return this.store.transact('readonly', dbCtx =>
      dbCtx.getNodeById('top'));
  }

  create(worker) {
    for (const ghost of Array.from(this.ghosts)) {
      throw ghost.throwable;
    }

    console.log('creating graph from', this);
    throw new Error(`#TODO 344`);
  }
}

class GraphGhostNode {
  constructor(parent, childName) {
    this.throwable = new Error(`Failed to get ${JSON.stringify(childName)}, doesn't exist`);
    this.parent = parent;
    this.childName = childName;
  }
}

class GraphBuilderNode {
  constructor(builder, parent, name, type, part, version, data) {
    this.parent = parent;

    this.name = name;
    this.type = type;
    this.part = part;
    this.version = version;

    this.data = part.fromExt(data);

    if (part.inner.origin === 'composite') {
      switch (part.inner.name) {
        case 'Struct':
          for (const [fieldName, field] of part.inner.fields) {

            Object.defineProperty(this, `set${fieldName}`, {
              value: function(value) {
                return part.setField(this.data, fieldName, value);
              },
            });
          }
          break;
        default: throw new Error(
          `Composite part ${part.inner.name} not implemented`);
      }
    } else {
      throw new Error(`Part ${part.inner.origin} ${part.inner.name} not implemented`);
    }

    this.names = new Map;
    this.ghosts = new Set;

    for (const [name, part] of builder.engine.names.entries()) {
      const isRelevant = this.part.relations.some(x =>
        x.type === 'Arbitrary' &&
        x.direction === 'out' &&
        x.otherType.name === name);
      if (!isRelevant) continue;

      Object.defineProperty(this, `with${name}`, {
        value: function(objName, objVersion, opts) {
          //console.log('building', objName, objVersion, type, part, 'with', opts, 'from', this);
          const object = new GraphBuilderNode(builder, this, objName, name, part, objVersion, opts);
          this.names.set(objName, object);
          return object;
        },
      });
      Object.defineProperty(this, `get${name}`, {
        value: function(objName) {
          if (!this.names.has(objName)) {
            const node = new GraphGhostNode(this, objName);
            this.ghosts.add(node);
            this.names.set(objName, node)
          }
          const object = this.names.get(objName);
          // TODO: typecheck at some point!~
          if (object.constructor !== GraphGhostNode && object.type !== name) {
            console.log('-->', object)
            throw new Error(
              `Failed to get ${JSON.stringify(name)} ${JSON.stringify(objName)}, was actually ${JSON.stringify(object.type)}`);
          }
          return object;
        },
      });
    }

  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    //GraphBuilder,
    GraphGhostNode,
    GraphBuilderNode,
  };
}
