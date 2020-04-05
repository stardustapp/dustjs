class TempDevice {
  constructor(opts) {
    this.entries = new Map();
  }

  getEntry(path) {
    return new TempEntry(this, path);
  }
}

class TempEntry {
  constructor(mount, path) {
    this.mount = mount;
    this.path = path;
  }

  async get() {
    const entry = this.mount.entries.get(this.path);
    if (!entry) return null;
    if (entry.Type) return entry;
    if (entry.get) return entry.get();
    throw new Error(`get() called but wasn't a gettable thing`);
  }

  async invoke(input) {
    const entry = this.mount.entries.get(this.path);
    if (!entry) return null;
    if (entry.invoke) return entry.invoke(input);
    throw new Error(`get() called but wasn't a gettable thing`);
  }

  async put(value) {
    console.log('putting', this.path, value);
    return this.mount.entries.set(this.path, value);
  }
}

// old impl
// this one is just a dressed up Environment, which is less ideal, I think

// const {Environment} = require('../api/environment.js');
//
// TempDevice extends Environment {
//   constructor(opts) {
//     super('tmp:');
//   }
//
//   async getEntry(path) {
//     return new TempEntry(this, path, await super.getEntry(path));
//   }
// }
//
// class TempEntry {
//   constructor(mount, path, upperEnv) {
//     this.mount = mount;
//     this.path = path;
//     this.upperEnv = upperEnv;
//   }
//
//   async get() {
//     if (this.upperEnv)
//       return this.upperEnv.get();
//   }
//
//   async invoke(input) {
//     if (this.upperEnv)
//       return this.upperEnv.invoke(input);
//   }
//
//   async enumerate(enumer) {
//     if (this.upperEnv)
//       return this.upperEnv.enumerate(enumer);
//   }
//
//   async put(value) {
//     if (this.path.length>1 && this.upperEnv)
//       return this.upperEnv.put(value);
//
//     console.log('putting', this.path, value);
//     return this.mount.bind(this.path, value);
//   }
// }

module.exports = {
  TempDevice,
  TempEntry,
};
