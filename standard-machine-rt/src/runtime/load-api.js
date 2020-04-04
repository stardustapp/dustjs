global.DustNode = class DustNode {}

exports.LoadApi = class LoadApi {
  constructor(key) {
    this.key = key;

    // these get filled in by the public functions
    this.modelFunc = null;
    this.lifecycle = new Array;
    this.names = new Map;
    this.behaviors = new Map;

    // start basic schema builder
    // this.buildFuncs = Object.create(null);
    // this.buildFuncs.name = this.createName.bind(this);

    // this.nameOptionFuncs = Object.create(null);
    // this.nameOptionFuncs.methods = this.
  }

  // call these to bring code in

  attachModel(modelFunc) {
    this.modelFunc = modelFunc;
  }

  attachLifecycle(protoClass) {
    this.lifecycle = this._captureMethods(protoClass.prototype);
  }

  attachBehavior(protoClass) {
    if (this.behaviors.has(protoClass.name)) throw new Error(
      `Driver ${this.key} loaded duplicate behavior ${protoClass.name}`);
    this.behaviors.set(protoClass.name, this._captureMethods(protoClass.prototype));
  }

  createName(name, options) {
    console.log('creating name', name, options)
  }

  // private functions for machine to take code out

  // async _compileSchema(builder) {
  //   // this.buildFuncs = Object.create(null);
  //   // this.buildFuncs.name = this.createName.bind(this);
  //   // builder.rig
  //   await this.modelFunc.call(null, builder);
  //   // const builder = this._newNamedObject('Builder', {
  //   //   Machine: machine,
  //   //   BaseDriver: this,
  //   //   EngineDriver: loadApi,
  //   // });
  //   // await loadApi.modelFunc.call(null, builder);
  //   return await builder.compile();
  // }

  _captureMethods(prototype) {
    const descriptors = Object.getOwnPropertyDescriptors(prototype);
    return Object
      .getOwnPropertyNames(descriptors)
      //.filter(x => x !== 'constructor')
      .map(x => [x, descriptors[x]])
  }

  _callLifecycle(name, ...args) {
    return this._getLifecycle(name).call(this, ...args);
  }

  _getLifecycle(name) { return this.lifecycle
    .filter(x => x[0] === name)
    .map(x => x[1])[0];
  }

  _makeObjectFactory(name, callback=null) {
    return data => {
      const object = this._newNamedObject(name, data);
      callback && callback(object);
      return object;
    };
  }

  _newNamedObject(name, data) {
    const behavior = this._getBehavior(name);
    const hasBuildMethod = behavior.some(x => x[0] === 'build');

    // if no build, attach data directly
    //console.log('hi', name, hasBuildMethod, data)
    const object = (hasBuildMethod ? false : data) || new DustNode;
    for (const [key, method] of behavior) {
      if (key === 'constructor') continue;
      Object.defineProperty(object, key, {
        value: method,
        enumerable: false,
        configurable: false,
      });
    }

    Object.defineProperty(object, '__origin', {
      value: {
        driver: this.key,
        name: name,
      },
      enumerable: true,
      configurable: false,
    });

    if (hasBuildMethod)
      object.build.call(object, data);
    return object;
  }

  _getBehavior(name) {
    const behavior = this.behaviors.get(name);
    if (behavior) return behavior;
    if (!name) throw new Error(
      `BUG: LoadApi can't get behavior for empty name`);
    throw new Error(
      `LoadApi ${this.key} lacking behavior for ${name}`);
  }
}
