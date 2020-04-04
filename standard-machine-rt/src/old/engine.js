function randomString(bytes=10) { // 32 for a secret
  const array = new Uint8Array(bytes);
  (crypto.getRandomValues || crypto.randomFillSync).call(crypto, array);
  let str = base64js
    .fromByteArray(array)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  // TODO: debug/account for too-short IDs
  //console.log('random str', bytes, str);
  return str;
}

class GraphObject {
  constructor(type, data) {
    this.type = type;
    this.data = data;
    //console.log('created GraphObject', data, type);

    for (const [key, fieldType] of type.inner.fields.entries()) {
      Object.defineProperty(this, key, {
        get() { return data[key]; }, // TODO
        //set(newValue) { bValue = newValue; },
        enumerable: true,
        configurable: true
      });
    }
  }
}

const GraphEngines = new LoaderCache(key => {
  throw new Error(`Engine ${key} isn't loaded`);
});
const EngineExtensions = new Map;
const EngineNameBehaviors = new Map;

const dynamicLoader = new DynamicEngineLoader;

class GraphEngine {
  constructor(builder) {
    const {key} = builder;
    if (GraphEngines.peek(key)) throw new Error(
      `Graph Engine ${key} is already registered, can't re-register`);

    this.engineKey = key;
    this.names = builder.names;
    this.edges = builder.edges;
    GraphEngines.set(key, this);

    this.topType = Array
      .from(this.edges)
      .find(x => x.constructor === TopRelationBuilder)
      .topType;

    if (!EngineExtensions.has(key))
      EngineExtensions.set(key, {});
    this.extensions = EngineExtensions.get(key);

    if (!EngineNameBehaviors.has(key))
      EngineNameBehaviors.set(key, new Map);
    this.nameBehaviors = EngineNameBehaviors.get(key);
  }

  static get(key) {
    const engine = GraphEngines.peek(key);
    if (engine) return engine;
    if (dynamicLoader.canLoad(key)) throw new Error(
      `BUG: Graph Engine ${JSON.stringify(key)} hasn't been loaded yet. Maybe you want .load(...) instead`);
    throw new Error(
      `Graph Engine ${JSON.stringify(key)} is not registered`);
  }

  static getOrPromise(key) {
    return GraphEngines.get(key);
  }

  static async load(key) {
    return dynamicLoader.getEngine(key);
  }

  static setEngine(key, promise) {
    GraphEngines.set(key, promise);
  }

  static extend(key) {
    let exts = EngineExtensions.get(key);
    if (!EngineExtensions.has(key)) {
      exts = {};
      EngineExtensions.set(key, exts);
    }
    return exts;
  }

  static attachBehavior(key, name, behavior) {
    let names = EngineNameBehaviors.get(key);
    if (!EngineNameBehaviors.has(key)) {
      names = new Map;
      EngineNameBehaviors.set(key, names);
    }

    if (names.has(name)) throw new Error(
      `TODO: adding another behavior for one engine/name combo`);

    names.set(name, behavior);
  }

  spawnObject(data, type=null) {
    const nodeType = type || this.names.get(data.Type);
    if (!this.nameBehaviors.has(data.typeName)) console.log(
      `! Missing type behavior for ${data.typeName} in ${this.engineKey}`);
    const behavior = this.nameBehaviors.get(data.typeName) || nodeType.behavior;
    if (!nodeType) throw new Error(
      `Object ${data.objectId} ${JSON.stringify(data.Name)
      } has unimplemented type ${JSON.stringify(data.Type)}`);
    return new behavior(nodeType, data);
  }

  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    if (depth < 0) {
      return [
        options.stylize('<engine', 'number'),
        options.stylize(this.engineKey, 'special'),
        options.stylize('/>', 'number'),
      ].join(' ');
    }

    let inner = Array.from(this.names.keys()).join(', ');
    if (depth > 0) {
      const {inspect} = require('util');
      const newOptions = Object.assign({}, options, {
        depth: options.depth === null ? null : options.depth - 2,
      });
      const parts = Array.from(this.names.values()).map(node => {
        return `    ${inspect(node, newOptions)}`
          .replace(/\n/g, `\n    `);
      });
      inner = parts.join('\n');
    }

    return [
      [
        options.stylize('<engine', 'number'),
        options.stylize(`key`, 'special'),
        options.stylize(this.engineKey, 'name'),
        options.stylize(`extensions`, 'special'),
        Object.keys(this.extensions).map(ext =>
          options.stylize(`'${ext}'`, 'string')
        ).join(', '),
        options.stylize('>', 'number'),
      ].join(' '),
      inner,
      options.stylize('  </engine>', 'number'),
    ].join('\n');
  }

  buildFromStore(buildOpts, rawStore) {
    const {lifecycle} = this.extensions;
    if (!lifecycle) throw new Error(
      `Engine ${this.engineKey} lacks a 'lifecycle' extension, can't build a new graph`);
    if (!lifecycle.buildNew) throw new Error(
      `Not sure how to build graph with engine '${this.engineKey}'`);

    return rawStore.transactGraph(graphCtx =>
      lifecycle.buildNew(graphCtx, buildOpts));
  }
  async buildUsingVolatile(buildOpts) {
    const tempStore = new RawVolatileStore({ engine: this });
    return await this.buildFromStore(buildOpts, tempStore);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphObject,
    GraphEngine,
    randomString,
  };
}
