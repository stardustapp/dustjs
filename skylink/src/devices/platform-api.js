// TODO: this is its own thing that doesn't really fit the other devices
// should probably use a builder pattern instead of double-duty

import {FolderEntry} from '../api/entries/FolderEntry.js';
import {StringEntry} from '../api/entries/StringEntry.js';
import {FlatEnumerable} from '../api/enumeration.js';
import {Environment} from '../api/environment.js';

export class PlatformApi {
  constructor(name) {
    this.name = name;
    this.paths = new Map;
    this.env = new Environment();

    // this gets filled in at .compile()
    this.structType = new PlatformApiTypeFolder(name);
  }

  getter(path, type, impl) {
    // TODO: better handling of the fact that paths must round-trip
    path = path.replace(' ', '%20');

    const baseName = decodeURIComponent(path.slice(1).split('/').slice(-1)[0]);
    const device = new PlatformApiGetter(this, baseName, type, impl);
    this.paths.set(path, device);
    this.env.bind(path, device);
    return this;
  }
  function(path, args) {
    // TODO: better handling of the fact that paths must round-trip
    path = path.replace(' ', '%20');

    const baseName = decodeURIComponent(path.slice(1).split('/').slice(-1)[0]);
    const device = new PlatformApiFunction(this, baseName, args);
    this.paths.set(path, device);
    this.env.bind(path, device);
    return this;
  }

  // build the data structure which is used to transfer APIs by-value
  compile() {
    console.log('Compiling', name);
    const fields = [];
    for (let [path, entry] of this.paths) {
      if (entry.constructor === PlatformApiGetter) {
        // TODO: nesting!
        fields.push(entry.type);
      }
    }
    this.structType.fields = fields;
  }

  // flattens the API into a JavaScript-style object
  construct(self) {
    var obj = {};
    this.paths.forEach((val, path) => {
      const key = path.slice(1).replace(/ [a-z]/, x => x[1].toUpperCase(1));
      switch (val.constructor) {
        case PlatformApiFunction:
          obj[key] = input => val.impl.call(self, input);
          break;
        case PlatformApiGetter:
          obj[key] = () => val.impl.call(self);
          break;
        default: throw new Error(
          `PlatformApi had path of weird constructor ${val.constructor}`);
      }
    });
  }

  getEntry(path) {
    return this.env.getEntry(path);
  }
}

export class PlatformApiGetter {
  constructor(self, name, type, impl) {
    this.self = self;
    this.type = PlatformApiType.from(type, name);
    this.impl = impl;
    this.get = this.get.bind(this);
  }
  get(self=this.self) {
    return Promise
      .resolve(this.impl.call(self))
      .then(x => this.type.serialize(x));
  }
  getEntry(path) {
    if (path.length === 0) return this;
    throw new Error(`Getters don't have any children`);
  }
}

export class PlatformApiFunction {
  constructor(self, name, {input, output, impl}) {
    this.self = self;
    this.inputType = PlatformApiType.from(input, 'input');
    this.outputType = PlatformApiType.from(output, 'output');
    this.impl = impl;
    this.invoke = this.invoke.bind(this);
  }
  invoke(input, self=this.self) {
    return Promise
      .resolve(this.impl.call(self, this.inputType.deserialize(input)))
      .then(x => ({
        get: () => this.outputType.serialize(x),
      }));
  }
  getEntry(path) {
    switch (path) {
      case '':
        return new FlatEnumerable(
          new StringEntry('input'),
          new StringEntry('output'),
          {Type: 'Function', Name: 'invoke'});
      case '/input':
        return { get: () => new StringEntry('input', JSON.stringify(this.inputType)) };
      case '/output':
        return { get: () => new StringEntry('output', JSON.stringify(this.outputType)) };
      case '/invoke':
        return this;
    }
  }
}

export class ExtendableError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

export class PlatformTypeError extends ExtendableError {
  constructor(fieldName, expectedType, actualType) {
    super(`API field ${JSON.stringify(fieldName)} is supposed to be type ${expectedType} but was actually ${actualType}`);
    this.fieldName = fieldName;
    this.expectedType = expectedType;
    this.actualType = actualType;
  }
}

export class PlatformApiTypeString {
  constructor(name, defaultValue=null, ser=String, de=String) {
    this.name = name;
    this.type = 'String';
    this.defaultValue = defaultValue;
    this.ser = ser;
    this.de = de;
  }
  serialize(value) {
    if (value == null)
      value = this.defaultValue;
    return new StringEntry(this.name, this.ser(value));
  }
  deserialize(literal) {
    if (!literal) {
      if (this.defaultValue != null)
        return this.defaultValue;
      throw new PlatformTypeError(this.name, 'String', 'Empty');
    }
    if (literal.Type !== 'String')
      throw new PlatformTypeError(this.name, 'String', literal.Type);
    return this.de(literal.StringValue);
  }
}

export class PlatformApiTypeNull {
  constructor(name) {
    this.name = name;
    this.type = 'Null';
  }
  serialize(value) {
    if (value != null) throw new Error(
      `Null type can't serialize anything other than null`);
    return null;
  }
  deserialize(literal) {
    if (literal != null) throw new Error(
      `Null type can't deserialize anything other than null`);
    return null;
  }
}

// Never put this on the network, it's a no-op, only for intra-process message passing.
export class PlatformApiTypeJs {
  constructor(name) {
    this.name = name;
    this.type = 'JS';
  }
  serialize(value) {
    return value;
  }
  deserialize(literal) {
    return literal;
  }
}

export class PlatformApiTypeFolder {
  constructor(name, fields=[]) {
    this.name = name;
    this.type = 'Folder';
    this.fields = fields;
  }
  serialize(value) {
    return new FolderEntry(this.name, this.fields
        .map(field => field.serialize(value[field.name])))
  }
  deserialize(literal) {
    if (!literal) throw new Error(
      `Folder ${
        JSON.stringify(this.name)
      } is required`);
    if (literal.Type !== 'Folder')
      throw new PlatformTypeError(this.name, 'Folder', literal.Type);

    const {Children} = literal;
    const struct = {};
    const givenKeys = new Set(Children.map(x => x.Name));
    for (const field of this.fields) {
      givenKeys.delete(field.name);
      const child = Children.find(x => x.Name === field.name);
      // TODO: transform struct keys for casing
      struct[field.name] = field.deserialize(child);
    }
    if (givenKeys.size !== 0) throw new Error(
      `Folder ${
        JSON.stringify(this.name)
      } had extra children: ${
        Array.from(givenKeys).join(', ')
      }`);

    return struct;
  }
}

export class PlatformApiType {
  static from(source, name) {
    if (source == null)
      return new PlatformApiTypeNull(name);

    // recognize a constructor vs. a literal default-value
    const sourceIsBareFunc = source.constructor === Function;
    const typeFunc = sourceIsBareFunc ? source : source.constructor;
    const givenValue = sourceIsBareFunc ? null : source;

    //console.log('schema', name, 'type', typeFunc, 'default', givenValue);
    switch (typeFunc) {

      // string-based literals
      case String:
        return new PlatformApiTypeString(name, givenValue);
      case Number:
        return new PlatformApiTypeString(name, givenValue,
            String,
            parseFloat);
      case Boolean:
        return new PlatformApiTypeString(name, givenValue,
            b => b ? 'yes' : 'no',
            s => ({yes: true, no: false})[s]);

      // nested data structures
      case Object: // TODO: better way to detect structures
        if (sourceIsBareFunc) {
          // blackbox objects become JSON strings lol fite me
          return new PlatformApiTypeString(name, {},
              JSON.stringify,
              JSON.parse);
        } else {
          const fields = Object
              .keys(givenValue)
              .map(name => PlatformApiType
                  .from(givenValue[name], name));
          return new PlatformApiTypeFolder(name, fields);
        }
      case PlatformApi:
        if (sourceIsBareFunc) throw new Error(
          `PlatformApi must be passed as a created instance`);
        return givenValue.structType;

      case Symbol:
        switch (givenValue) {
          case Symbol.for('raw js object'):
            return new PlatformApiTypeJs(name);

        }
      default: throw new Error(
        `Unable to implement type for field ${JSON.stringify(name)}`);
    }
  }
}
