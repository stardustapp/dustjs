"use strict";

class Skylink {
  constructor(prefix, endpoint, stats) {
    this.prefix = prefix || '';
    this.stats = stats || {
      ops: 0,
      chans: 0,
      pkts: 0,
      fails: 0,
    };

    if (endpoint && endpoint.constructor === Skylink) {
      // If given a skylink, inherit its context/transport
      this.prefix = endpoint.prefix + this.prefix;
      this.endpoint = endpoint.endpoint;
      this.protocol = endpoint.protocol;
      this.transport = endpoint.transport;
    } else {
      // If given string or nothing, make a new transport
      this.endpoint = endpoint || '/~~export';
      this.protocol = 'http';
      if (this.endpoint.startsWith('ws')) {
        this.protocol = 'ws';
      }
      this.startTransport();
    }
  }

  static openChart(chartOverride) {
    var chartName = 'public';
    if (chartOverride) {
      chartName = chartOverride;
    } else if (location.pathname.startsWith('/~~')) {
      throw new Error("Core routes don't have a chart");
    } else if (location.pathname.startsWith('/~')) {
      chartName = location.pathname.split('/')[1].slice(1);
    }

    var secret;
    const secretKey = `skychart.${chartName}.secret`;
    if (localStorage[secretKey]) {
      secret = Skylink.String('secret', localStorage[secretKey]);
    }

    const endpoint = 'ws' + location.origin.slice(4) + '/~~export/ws';
    const skychart = new Skylink('', endpoint);
    const promise = skychart
      .invoke('/pub/open/invoke', Skylink.String('', chartName), '/tmp/chart')
      .then(() => skychart.invoke('/tmp/chart/launch/invoke', secret))
      .then(x => {
        if (x.Name === 'error') {
          var pass = prompt(x.StringValue + `\n\nInput a secret:`);
          if (pass) {
            return skychart.invoke('/tmp/chart/launch/invoke', Skylink.String('secret', pass));
          }
        }
        return x;
      })
      .then(x => {
        if (x.Name === 'error') {
          alert(`Couldn't open chart. Server said: ${x.StringValue}`);
          return Promise.reject('Server said: ' + x.StringValue);
        }
        return x;
      })
      .then(x => {
        skychart.stopTransport();
        return x.StringValue;
      })
      .then(x => new Skylink('/pub/sessions/' + x + '/mnt', endpoint));
    promise.chartName = chartName;
    return promise;
  }

  //////////////////////////////////////
  // First-order operations

  ping() {
    return this.exec({Op: 'ping'}).then(x => x.Ok);
  }

  get(path) {
    return this.exec({
      Op: 'get',
      Path: (this.prefix + path) || '/',
    }).then(x => x.Output);
  }

  enumerate(path, opts={}) {
    const maxDepth = opts.maxDepth == null ? 1 : +opts.maxDepth;
    const shapes = opts.shapes || [];
    return this.exec({
      Op: 'enumerate',
      Path: this.prefix + path,
      Depth: maxDepth,
      Shapes: shapes,
    }).then(res => {
      const list = res.Output.Children;
      if (opts.includeRoot === false) {
        list.splice(0, 1);
      }
      return list;
    });
  }

  subscribe(path, opts={}) {
    const maxDepth = opts.maxDepth == null ? 1 : +opts.maxDepth;
    return this.exec({
      Op: 'subscribe',
      Path: this.prefix + path,
      Depth: maxDepth,
    });
  }

  store(path, entry) {
    return this.exec({
      Op: 'store',
      Dest: this.prefix + path,
      Input: entry,
    });
  }

  storeRandom(parentPath, entry) {
    const name = Skylink.randomId();
    const fullPath = parentPath + '/' + name;
    return this
      .store(fullPath, Skylink.toEntry(name, entry))
      .then(() => name);
  }

  invoke(path, input, outputPath) {
    return this.exec({
      Op: 'invoke',
      Path: this.prefix + path,
      Input: input,
      Dest: outputPath ? (this.prefix + outputPath) : '',
    }).then(x => x.Output);
  }

  copy(path, dest) {
    return this.exec({
      Op: 'copy',
      Path: this.prefix + path,
      Dest: this.prefix + dest,
    });
  }

  unlink(path) {
    return this.exec({
      Op: 'unlink',
      Path: this.prefix + path,
    });
  }

  // File-based API

  putFile(path, data) {
    const nameParts = path.split('/');
    const name = nameParts[nameParts.length - 1];
    return this.store(path, Skylink.File(name, data));
  }

  loadFile(path) {
    return this.get(path).then(x => {
      if (x.Type !== 'File') {
        return Promise.reject(`Expected ${path} to be a File but was ${x.Type}`);
      } else {
        const encoded = base64js.toByteArray(x.FileData || '');
        return new TextDecoder('utf-8').decode(encoded);
      }
    });
  }

  // String-based API

  putString(path, value) {
    const nameParts = path.split('/');
    const name = nameParts[nameParts.length - 1];
    return this.store(path, Skylink.String(name, value));
  }

  loadString(path) {
    return this.get(path).then(x => {
      if (x.Type !== 'String') {
        return Promise.reject(`Expected ${path} to be a String but was ${x.Type}`);
      } else {
        return x.StringValue || '';
      }
    }, err => {
      // missing entries should be empty
      if (err.Ok === false) {
        return '';
      } else {
        throw err;
      }
    });
  }

  //////////////////////////////////////
  // Helpers to build an Input

  static toEntry(name, obj) {
    if (obj == null) return null;
    if (obj.Type) return obj;
    switch (obj.constructor) {
      case String:
        return Skylink.String(name, obj);
      case Object:
        const children = Object.keys(obj)
          .map(x => Skylink.toEntry(x, obj[x]));
        return Skylink.Folder(name, children);
      default:
        throw new Error(`Skylink can't toEntry a ${obj.constructor}`);
    }
  }

  static String(name, value) {
    return {
      Name: name,
      Type: 'String',
      StringValue: value,
    };
  }

  static Link(name, target) {
    return {
      Name: name,
      Type: 'Link',
      StringValue: target,
    };
  }

  static File(name, data) {
    const encodedData = new TextEncoder('utf-8').encode(data);
    return {
      Name: name,
      Type: 'File',
      FileData: base64js.fromByteArray(encodedData),
    };
  }

  static Folder(name, children) {
    return {
      Name: name,
      Type: 'Folder',
      Children: children || [],
    };
  }

  static randomId() {
    return [
      Date.now().toString(36),
      Math.random().toString(36).slice(2).slice(-4) || '0',
    ].join('_');
  }

  //////////////////////////////////////
  // The actual transport

  startTransport() {
    switch (this.protocol) {
      case 'ws':
        this.transport = new SkylinkWsTransport(this.endpoint, this.stats, true);
        break;
      case 'http':
        this.transport = new SkylinkHttpTransport(this.endpoint, this.stats, true);
        break;
      default:
        alert(`Unknown Skylink transport protocol "${this.protocol}"`);
        return
    }
    return this.transport.start();
  }

  stopTransport() {
    this.transport.stop();
    this.transport = null;
  }

  exec(request) {
    if (!this.transport) {
      console.log("No Skylink transport is started, can't exec", request);
      return Promise.reject("The Skylink transport is not started");
    } else {
      this.stats.ops++;
      return this.transport.exec(request);
    }
  }
}

if (typeof module !== "undefined" && module !== null) {
  module.exports = Skylink;
}