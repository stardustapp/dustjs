class MountTable {
  constructor(baseUri, setStatus) {
    this.baseUri = baseUri || 'tmp://';
    this.mounts = new Map();
    this.setStatus = setStatus;

    this.api = {};
    this.buildApis();
  }

  buildApis() {
    ALL_OPS.forEach(op => {
      this.api[op] = (path, ...args) => {
        const [mount, subPath] = this.matchPath(path);
        return mount.api[op](subPath, ...args);
      };
    });
  }

  updateStatus() {
    var statuses = [];
    this.mounts.forEach(m => {
      if (m.status) {
        statuses.push(m.status);
      }
    });
    console.log('MountTable saw statuses:', statuses);
    this.setStatus(statuses.length ? statuses.join('/') : 'Standalone');
  }

  matchPath(path) {
    var soFar = '';
    const idx = path.split('/').findIndex((part, idx) => {
      if (idx) {
        soFar += '/'+part;
      }
      if (this.mounts.has(soFar)) {
        return true;
      }
    })
    if (idx === -1) {
      throw new Error("Mount table didn't find a match for "+path);
    }
    return [this.mounts.get(soFar), path.slice(soFar.length)];
  }

  mount(path, type, opts) {
    opts = opts || {};
    console.log('Mount request:', path, type, opts);

    //const mount = {path, type, opts, status: 'Connecting'};
    var mount;
    switch (type) {
      case 'skylink':
        mount = new SkylinkMount(opts, this.updateStatus.bind(this));
        break;
      default:
        alert('bad mount type '+type+' for '+path);
        throw new Error('bad mount type '+type+' for '+path);
    }
    //const mount = new {path, type, opts, status: 'Connecting'};
    this.mounts.set(path, mount);

    this.updateStatus();
    /*

    console.log('Orbiter launched, at', path);
    this.status = 'Ready';
    this.mounttable.mount({path: '/srv', skylink: this.skylink});

    this.skylink = new Skylink(path, endpoint);
    this.skylink.stats = this.stats;
    this.skylink.transport.donePromise.then(() => {
      this.status = 'Offline';
    }, (err) => {
      this.status = 'Crashed';
      throw err;
    });
    */
  }
}