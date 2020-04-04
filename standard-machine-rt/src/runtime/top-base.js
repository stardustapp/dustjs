const topProvider = new EntityProvider('driver', 'base.base');

// class TopKind extends  {
//   constructor(name, makeFunc) {
//     this.name = name;
//     this.makeFunc = makeFunc;
//   }
//   makeObject(input) {
//     const obj = new TopKindObject(this);
//     this.makeFunc(obj, input);
//     return obj;
//   }
// }
// class TopKindObject {
//   constructor(kind) {
//     this.kind = kind;
//   }
// }

exports.TopBase = class TopBase extends EntityProvider {
  constructor(topMachine) {
    super('driver', 'base.base');
    this.topMachine = topMachine;

    //this.exportNewEntity('Kind', 'Interface');
    this.exportNewEntity('NativeObjectEntity', 'NativeObject', {
      constructorName: 'NativeObjectEntity',
    });
    this.exportNewEntity('TypeEntity', 'NativeObject', {
      constructorName: 'TypeEntity',
    });
    this.exportNewEntity('NativeJsObject', 'NativeObject', {
      constructorName: 'Object',
    });

    // some builtins off those

    this.exportNewEntity('Driver', 'Interface', {
      methods: {
        'GetName': {
          input: 'String',
          output: 'Object',
        },
      },
    });

    this.exportNewEntity('Object', 'Interface', {
      methods: {
      },
    });

    this.exportNewEntity('CompileDriver', 'Function', {
      input: 'LoadApi',
      output: 'EntityProvider',
      impl: loadApi => {
        const builder = Object.create(null);
        const provider = new EntityProvider('driver', loadApi.key);
        //console.log('hi', loadApi, this, provider);
        constructDriverBuilder.call(builder, provider, this.topMachine);
        return builder.Make(loadApi);
        //throw new Error('TODO: CompileDriver()');
      }
    });

    // this.exportNewEntity('DriverFactory', 'Interface', {
    //   methods: {
    //     'CompileDriver': {
    //       input: 'LoadApi',
    //       output: 'Driver',
    //     },
    //   },
    // });

    // this.exportNewEntity('DriverBuilder', 'Type', {
    //   methods: {
    //     'Build': {
    //       output: 'Driver',
    //       impl() {
    //         throw new Error('TODO: DriverBuilder.Build()');
    //       }
    //     },
    //   },
    // });

    this.exportNewEntity('LoadApi', 'NativeObject', {
      constructorName: 'LoadApi',
    });
    this.exportNewEntity('EntityProvider', 'NativeObject', {
      constructorName: 'EntityProvider',
      //bases: ['Driver'],
    });

    // this.exportNewEntity('DataType', 'Interface', {
    //   methods: {
    //     'GetName': {
    //       input: String,
    //       output: 'DriverBuilder',
    //     },
    //   },
    // });

    this.exportNewEntity('JsTuple', 'DataType', {
      readValue: function (value) {
        if (value == null) return [];
        if (value.constructor !== Array) throw new Error(
          `JsTuple failed to read non-Array`);
        return value;
      },
    });

    function curryEnsureJsType(type) {
      return function (input) {
        if (input == null) throw new Error(
          `Primitive ${input} cannot be null`);
        if (typeof input !== type) throw new Error(
          `Was given '${typeof input}', but needed ${type}`);
        return input;
      }
    }

    this.exportNewEntity('String', 'DataType', {
      readValue: curryEnsureJsType('string'),
      export: curryEnsureJsType('string'),
      // fromJson()
      // toJson()
    });
    this.exportNewEntity('FloatingPoint', 'DataType', {
      readValue: curryEnsureJsType('number'),
      export: curryEnsureJsType('number'),
      // fromJson()
      // toJson()
    });
    this.exportNewEntity('Boolean', 'DataType', {
      readValue: curryEnsureJsType('boolean'),
      export: curryEnsureJsType('boolean'),
      // fromJson()
      // toJson()
    });
    // TODO: Date
    // TODO: Blob
    // TODO: Primitive Arrays ([]uint8)

    // this.exportNewEntity('Folder', 'DataType', {
    //   readValue: curryEnsureJsType('boolean'),
    //   export: curryEnsureJsType('boolean'),
    //   // fromJson()
    //   // toJson()
    // });

    // this.storeInstanceOf('Type', {
    //   name: 'DriverBuilder',
    //   config: {
    //     construct: constructDriverBuilder,
    //   },
    // });
    // this.storeInstanceOf('Type', {
    //   name: 'Driver',
    //   config: {
    //     construct: constructDriver,
    //   },
    // });

    //this.link();
  }
  // createTopKind(name, makeFunc) {
  //   this.names.set(name, new TopKind(name, makeFunc));
  // }
  // storeInstanceOf(name, opts) {
  //   const newName = this
  //     .names.get(name)
  //     .makeObject(opts);
  //   this.names.set(opts.name, newName);
  //   return newName;
  // }
  //
  // _newNamedObject(name, data) {
  //   const def = this.names.get(name);
  //   if (!def) throw new Error(
  //     `Top Kind not found: '${name}'`);
  //   if (def.constructor === TopKind)
  //     return def.makeObject(data);
  //   if (def.constructor === TopKindObject)
  //     return def.makeObject(data);
  //   throw new Error(`TODO 2! ${name}`);
  // }

  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    return '<TopBase/>';
  }
}


function constructDriverBuilder(provider, machine) {
  this.provider = provider;
  //this.availDrivers = new Map;
  //this.names = new Map;
  //this.allRelations = new Set;
  this.typesets = new Map;

  this.usingTypeset = async function (key) {
    const driver = await machine.loadDriver('typeset', key);
    this.typesets.set(key, driver);
    this.provider.exportNewEntity(key, 'Import', {driver});
    //this.availDrivers.set('typeset.'+key, driver);
    return this;
  };

  // const resolver = (path) => {
  //   if (path.includes('/')) {
  //     const [driverName, name] = path.split('/');
  //     const driver = this.availDrivers.get(driverName);
  //     if (!driver) throw new Error(
  //       `Can't resolve name to unreffed driver ${driverName}`);
  //     const item = driver.names.get(name);
  //     if (!item) throw new Error(
  //       `Can't resolve name ${name} from driver ${driverName}`);
  //     return item;
  //   }
  //   throw new Error(`TODO resolve ${path}`);
  // }

  this.nameDataType = function (name, config) {
    const methods = {};
    const givenMethods = config.methods || {}; // TODO TODO
    const behavior = this.loadApi.behaviors.get(name);
    if (behavior) {
      for ([key, descriptor] of behavior) {
        if (key === 'constructor') continue;
        // if (['ingest', 'export'].includes(key))
        //   realConfig[key] = func;
        // else
        console.log('key', key, descriptor, )
        const baseCfg = givenMethods[key] || {};
        if (typeof descriptor.value === 'function') {
          methods[key] = {...baseCfg, impl: descriptor.value};
        } else if (typeof descriptor.get === 'function') {
          methods[key] = {...baseCfg, impl: descriptor.get, isProperty: true};
        } else throw new Error(
          `Weird behavior value type ${typeof descriptor.value}`);
      }
    }

    for (const [typeset, typeDriver] of this.typesets) {
      if (typeset in config) {
        // const args = {};
        // args[typeset] = config[typeset]
        //console.log('reading signature', config[typeset])
        typeImpl = typeDriver
          .readSignature('ReadSignature')
          .resolveWith(typeDriver)
          .invoke(provider, config, typeDriver);
        const dataTypeFields = typeImpl.makeDataType.invoke(provider, name, typeImpl);
        console.log('DataType fields', dataTypeFields);
        this.provider.exportNewEntity(name, 'DataType', {
          ...config,
          ...dataTypeFields,
          methods,
        });
        return;
      }
    }

    // no typeset in use - just pass through
    this.provider.exportNewEntity(name, 'DataType', {
      ...config,
      methods,
    });
  }
  this.nameFunction = function (name, config) {
    this.provider.exportNewEntity(name, 'Function', config);
  }
  this.nameInterface = function (name, config) {
    this.provider.exportNewEntity(name, 'Interface', config);
  }

  // needsEngine(key) {
  //   this.config.engineDeps.push(key);
  // }
  //
  //
  // resolveName(name) {
  //   if (this.names.has(name))
  //     return this.names.get(name);
  //   throw new Error(`No match for name ${name}`);
  //   return null;
  // }

  this.Make = async function (loadApi) {
    this.loadApi = loadApi;

    this.provider.exportNewEntity('base.base', 'Import', {
      driver: await machine.loadDriver('base', 'base'),
    });

    // for (const engineDep of this.config.engineDeps) {
    //   this.engineDeps.set(engineDep, await this
    //     .Machine.loadDriver('engine', engineDep));
    // }

    //console.log('building driver', this.names)
    // const instance = this.BaseDriver
    //   ._newNamedObject('Driver', {
    //     EngineDriver: this.EngineDriver,
    //     EngineDeps: this.engineDeps,
    //     GraphBuilder: this.BaseDriver
    //       ._makeObjectFactory('Graph'),
    //     NodeMap: this.names,
    //     AllRelations: this.allRelations,
    //   });

    // links relations
    // for (const [name, entry] of this.names) {
    //   console.log('linking', name);
    //   await entry.link(this);
    // }



    console.log('compiling', loadApi, 'with builder', this);

    await loadApi.modelFunc.call(null, this);

    // const driverInterface = provider
    //   .readSignature('base.base/Driver')
    //   .resolveWith(provider);
    // this.provider.exportNewEntity('Self', 'DataType', {
    //
    // });

    this.provider.exportNewEntity('CompileDriver', 'Function', {
      input: 'base.base/LoadApi',
      output: 'base.base/EntityProvider',
      impl: loadApi => {
        const builder = Object.create(null);
        const provider = new EntityProvider('driver', loadApi.key);
        //console.log('hi', loadApi, this, provider);
        constructDriverBuilder.call(builder, provider, machine);
        return builder.Make(loadApi);
        //throw new Error('TODO: CompileDriver()');
      }
    });
    //
    // const driver = provider._newNamedObject('Driver', {
    //   machine,
    //   loadApi,
    //   names: this.names,
    // });

    return this.provider;
  }

  console.log('constructed DriverBuilder', this, 'with input', typeof input);

}
