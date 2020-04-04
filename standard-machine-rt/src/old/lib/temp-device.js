const {Environment} = require('./../core/environment.js');

exports.TempDevice = class TempDevice extends Environment {
  constructor(opts) {
    super('tmp:');
  }

  async getEntry(path) {
    return new TempEntry(this, path, await super.getEntry(path));
  }
}

class TempEntry {
  constructor(mount, path, upperEnv) {
    this.mount = mount;
    this.path = path;
    this.upperEnv = upperEnv;
  }

  async get() {
    if (this.upperEnv)
      return this.upperEnv.get();
  }

  async invoke(input) {
    if (this.upperEnv)
      return this.upperEnv.invoke(input);
  }

  async enumerate(enumer) {
    if (this.upperEnv)
      return this.upperEnv.enumerate(enumer);
  }

  async put(value) {
    if (this.path.length>1 && this.upperEnv)
      return this.upperEnv.put(value);

    console.log('putting', this.path, value);
    return this.mount.bind(this.path, value);
  }
}
