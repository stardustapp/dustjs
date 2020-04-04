class EntityProvider {
  constructor(myType, myId) {
    Object.defineProperties(this, {
      'myType': {
        value: myType,
        enumerable: true,
        configurable: false,
      },
      'myId': {
        value: myId,
        enumerable: true,
        configurable: false,
      },
      'nameRegistry': {
        value: new Map,
        enumerable: false,
        configurable: false,
      },
      'allSignatures': {
        value: new Set,
        enumerable: false,
        configurable: false,
      },
    });
    //this.builtEntities = 0;
  }

  exportNewEntity(name, kindName, options={}) {
    if (this.nameRegistry.has(name)) throw new Error(
      `Cannot re-export name ${name}`);

    const kind = EntityKinds.get(kindName);
    if (!kind) throw new Error(
      `Tried to export entity of weird kind ${kindName}`);
    if (kind.prototype instanceof EntityBase) {
      this.nameRegistry.set(name, new kind(this, name, options));
    } else throw new Error(
      `Can only register entities to EntityProvider`);
  }

  invokeEntity(name, args) {
    const entity = this.nameRegistry.get(name);
    if (!entity) throw new Error(
      `Tried to invoke entity of weird kind ${name}`);
    if (typeof entity.invoke !== 'function') throw new Error(
      `Entity ${name} is not invokable`);
    return entity.invoke(this, args);
  }

  readSignature(rawSig) {
    if (typeof rawSig !== 'string') throw new Error(
      `Signature can only be a string for now`);
    const signature = new EntitySignature(rawSig);
    this.allSignatures.add(signature);
    return signature;
  }

  readValue(signature, rawValue) {
    const entity = signature.resolveWith(this);
    //console.log('Provider.readValue:', {signature, entity, rawValue});
    if (typeof entity.readValue !== 'function')
      throw new Error(`Entity '${signature}' is '${entity.constructor.name}', isn't readable`);
    return entity.readValue(rawValue);
  }
}

class EntitySignature {
  constructor(raw) {
    if (raw.includes('->')) throw new Error(
      `TODO: Signatures cannot describe anonymous Functions yet`);
    if (raw.includes(' ')) throw new Error(
      `Signatures cannot contain whitespace yet`);

    this.parts = raw.split('/');
    if (this.parts.some(x => x.length === 0)) throw new Error(
      `Signature has empty parts`);
  }
  resolveWith(provider) {
    let final = provider;
    for (const part of this.parts) {
      if (final.constructor.prototype instanceof EntityProvider || final.constructor === EntityProvider) {
        final = final.nameRegistry.get(part);
        // TODO: handle Import types instead
      } else if (final.constructor === ImportEntity) {
        final = final.resolveName(part);
      } else throw new Error(
        `Name '${part}' in '${this.parts.join('/')}' isn't resolving from a provider`);
      if (!final) throw new Error(
        `Failed to select name '${part}' in '${this.parts.join('/')}'`);
    }
    return final;
  }
  toString() {
    return this.parts.join('/');
  }
  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    return `<EntitySignature "${this}" />`;
  }
}

class EntityBase {
  constructor(providedBy, myName, myKind) {
    Object.defineProperties(this, {
      'providedBy': {
        value: providedBy,
        enumerable: true,
        configurable: false,
      },
      'myName': {
        value: myName,
        enumerable: true,
        configurable: false,
      },
      'myKind': {
        value: myKind,
        enumerable: true,
        configurable: false,
      },
    });
  }
}

function ensureKeys(obj, okMap) {
  const badKeys = new Set;
  for (const key in obj)
    if (key in okMap) {
      if (typeof obj[key] !== okMap[key]) {
        console.log('Unexpected value:', obj[key]);
        throw new Error(
          `Key '${key}' wanted ${okMap[key]}, is actually ${typeof obj[key]}`);
      }
    } else badKeys.add(key);

  if (badKeys.size > 0) throw new Error(
      `Object had unexpected keys ${Array.from(badKeys).join(', ')}; expected ${Object.keys(okMap).join(', ')}`);
}

class MethodicalEntityBase extends EntityBase {
  constructor(providedBy, name, type, opts) {
    super(providedBy, name, type);

    this.methods = new Map;
    for (const methodName in opts.methods) {
      // TODO: isProperty should use something other than FunctionEntity
      // (product type of getter/setter probs)
      const {isProperty, ...otherStuff} = opts.methods[methodName];

      const spec = {
        self: name,
        ...otherStuff,
      };
      if (!spec.impl && type !== 'Interface') throw new Error(
        `Entity ${name} method ${methodName} lacks impl`);
      const func = new FunctionEntity(providedBy, name+'.'+methodName, spec);
      this.methods.set(methodName, func);
    }

    this.bases = new Set;
    for (const name of opts.bases || []) {
      this.bases.add(providedBy.readSignature(name));
    }
  }
}

class JsValueEntity extends EntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {typeName: 'string'});
    super(providedBy, name, 'JsValue');
    this.typeName = opts.typeName;
  }
  readValue(rawValue) {
    if (typeof rawValue !== this.typeName) throw new Error(
      `JsObject was expecting ${this.typeName}, not ${typeof rawValue}`);
    return rawValue;
  }
}

class NativeObjectEntity extends EntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {constructorName: 'string'});
    super(providedBy, name, 'NativeObject');
    this.constructorName = opts.constructorName;
  }
  readValue(rawValue) {
    if (this.constructorName) {
      if (typeof rawValue !== 'object') throw new Error(
        `NativeObject was expecting object, not ${typeof rawValue}`);
      if (rawValue.constructor.name !== this.constructorName) throw new Error(
        `NativeObject was expecting '${this.constructorName}', not '${rawValue.constructor.name}'`);
      return rawValue;
    } else throw new Error(
      `NativeObject had no specification`);
  }
}

// class CustomKindEntity extends EntityBase {
//   constructor(providedBy, name, opts) {
//     super(providedBy, name, 'Type');
//   }
// }

class DataTypeEntity extends MethodicalEntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {
      readValue: 'function', export: 'function',
      handler: 'object',
      methods: 'object', bases: 'object',
    });
    super(providedBy, name, 'DataType', opts);

    if ('readValue' in opts)
      this.readValue = opts.readValue;
    if ('export' in opts)
      this.exportFunc = opts.export;
  }
  invoke(provider, rawInput) {
    console.log('DataType invoke', )
    const frame = new DataFrameEntity(provider, this.myName, {
      dataType: this,
    });
    frame.replaceData(rawInput);
    return frame;
  }
  hasBase(base) {
    for (const baseSig of this.bases || []) {
      const thisBase = baseSig.resolveWith(this.providedBy);
      if (base === thisBase) return true;
    }
    return false;
  }
  readValue(rawVal) {
    //console.log('reading raw val', rawVal);
    if (rawVal == null) throw new Error(
      'readValue got null');
    if (rawVal.myKind !== 'DataFrame') throw new Error(
      `DataType can only read DataFrames`);
    if (rawVal.dataType !== this) throw new Error(
      `DataType ${this.myName} asked to read DataFrame ${rawVal.myName}`);
    return rawVal;
  }
}

// I guess this is basically a box
class DataFrameEntity extends EntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {dataType: 'object'});
    super(providedBy, name, 'DataFrame');
    if (opts.dataType.myKind !== 'DataType') throw new Error(
      `Can't use dataType of kind ${opts.dataType.myKind} for DataFrame`);
    this.dataType = opts.dataType;
    this.innerData = null;

    console.log('methods', opts.dataType.methods.keys());
    for (const [methodName, func] of opts.dataType.methods) {
      //console.log('method', methodName)
      // TODO: let one of the methods decorate the frame?
      this[methodName] = func;
    }
  }
  replaceData(newData) {
    //console.log(this.dataType)
    if (!newData && !this.innerData)
      this.innerData = this.dataType.readValue(newData);
  }
}

class InterfaceEntity extends MethodicalEntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {
      methods: 'object', bases: 'object',
    });
    super(providedBy, name, 'Interface', opts);
  }
  readValue(rawValue) {
    if (rawValue.myKind !== 'DataFrame') throw new Error(
      `InterfaceEntity can't read entities kinded '${rawValue.myKind}'`);
    if (!rawValue.dataType.hasBase(this)) throw new Error(
      `DataType ${rawValue.dataType.myName} isn't based on Interface ${this.myName}`);
    return rawValue;
  }
}

class FunctionEntity extends EntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {
      self: 'string', input: 'string', output: 'string',
      impl: 'function',
    });
    super(providedBy, name, 'Function');
    if ('self' in opts)
      this.selfSig = providedBy.readSignature(opts.self);
    if ('input' in opts)
      this.inputSig = providedBy.readSignature(opts.input);
    if ('output' in opts)
      this.outputSig = providedBy.readSignature(opts.output);
    if ('impl' in opts)
      this.implFunc = opts.impl;
  }
  invoke(provider, rawInput=undefined, rawSelf=undefined) {
    if (typeof this.implFunc !== 'function') throw new Error(
      `Function ${this.myName} has no implementation, can't be invoked`);

    let input;
    if ('inputSig' in this) {
      input = this.providedBy.readValue(this.inputSig, rawInput);
    } else if (rawInput !== undefined) throw new Error(
      `Input was passed to Function ${this.myName} when it wasn't expected`);

    // TODO
    let self;
    if ('selfSig' in this) {
      self = this.providedBy.readValue(this.selfSig, rawSelf);
    } else if (rawSelf !== undefined) throw new Error(
      `Self was passed to Function ${this.myName} when it wasn't expected`);

    const rawOutput = this.implFunc.call(self, input);

    if (rawOutput && typeof rawOutput.then === 'function') {
      return rawOutput.then(out => {
        if ('outputSig' in this) {
          return this.providedBy.readValue(this.outputSig, out)
        } else if (out !== undefined) throw new Error(
          `Function ${this.myName} returned Output async when it wasn't expected`);
      });
    } else {
      if ('outputSig' in this) {
        return this.providedBy.readValue(this.outputSig, rawOutput)
      } else if (rawOutput !== undefined) throw new Error(
        `Function ${this.myName} returned Output when it wasn't expected`);
    }
  }
}

class ImportEntity extends EntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {driver: 'object'});
    super(providedBy, name, 'Import');
    if ('driver' in opts) {
      this.sourceType = 'EntityProvider';
      if (!(opts.driver.constructor.prototype instanceof EntityProvider || opts.driver.constructor === EntityProvider)) throw new Error(
        `ImportEntity given ${opts.driver.constructor.name} that isn't an EntityProvider`);
      this.source = opts.driver;
    }
  }
  resolveName(name) {
    return this.source.nameRegistry.get(name);
  }
}

// class InstanceEntity extends EntityBase {
//   constructor(providedBy, name, opts) {
//     ensureKeys(opts, {driver: 'object'});
//     super(providedBy, name, 'Instance');
//   }
// }

const EntityKinds = new Map;
EntityKinds.set('NativeObject', NativeObjectEntity);
EntityKinds.set('JsValue', JsValueEntity);
EntityKinds.set('DataType', DataTypeEntity);
EntityKinds.set('DataFrame', DataFrameEntity);
EntityKinds.set('Interface', InterfaceEntity);
EntityKinds.set('Function', FunctionEntity);
EntityKinds.set('Import', ImportEntity);
// EntityKinds.set('Instance', InstanceEntity);

module.exports = {
  EntityProvider,
  EntityBase,

  NativeObjectEntity,
  JsValueEntity,
  DataTypeEntity,
  InterfaceEntity,
  FunctionEntity,
  //InstanceEntity,
};
