// TODO: when should dynamic loading be allowed?

const fs = require('fs');
const path = require('path');
const {promisify} = require('util');
const readDir = promisify(fs.readdir);

const {AsyncCache} = require('./utils/async-cache.js');
const {LoadApi} = require('./load-api.js');

const importantFiles = [
  'schema.js', 'lifecycle.js', // established concepts
  //'ddp-api.js', 'compile.js', 'json-codec.js', // legacy files
];

// TODO: perform the file I/O async.
// https://stackoverflow.com/a/21681700
// console.log(require.extensions['.js'].toString())
exports.SystemLoader = class SystemLoader {
  constructor({
    hostDir,
  }={}) {
    this.loadCache = new AsyncCache({
      loadFunc: this.loadDriver.bind(this, hostDir),
      keyFunc(key) { return key.split('/')[0]; },
      cacheRejects: true,
    });
    this.availableDrivers = fs.readdirSync(hostDir);
  }

  // consumer APIs
  canLoad(key) {
    return this.availableDrivers.includes(this.loadCache.keyFunc(key));
  }
  async getDriver(key) {
    const result = await this.loadCache.get(key);
    // throw new Error(
    //   `Driver ${key} isn't available to load from source`);
    if (result instanceof Error) throw new Error(
       `Driver ${key} failed to load due to ${result.constructor.name}`);
    else return result;
  }

  async loadDriver(hostDir, key) {
    if (!this.availableDrivers.includes(key))
      return false; // engine doesn't exist

    global.CURRENT_LOADER = new LoadApi(key);

    const engineDir = path.join(hostDir, key);
    //console.log('Dynamically loading engine from', engineDir);
    try {
      console.group(`[${key}] Loading driver...`);
      await this.requireFromPath(engineDir);
      return global.CURRENT_LOADER;
    } catch (err) {
      console.error('Encountered', err.constructor.name, 'loading driver from', engineDir);
      throw err;
    } finally {
      console.groupEnd();
      delete global.CURRENT_LOADER;
    }
  }

  async requireFromPath(engineDir) {
    const engineFiles = await readDir(engineDir);
    if (!engineFiles.includes('schema.js')) throw new Error(
      `Driver directory is missing schema.js`);

    // TODO: error if package.json but not node_modules
    // or maybe actually parse package.json and be smart

    //console.log('Dynamically loading model engine from', engineDir, engineFiles);
    const necesaryFiles = new Array;

    for (const engineFile of engineFiles) {
      if (importantFiles.includes(engineFile))
        necesaryFiles.push(path.join(engineDir, engineFile));
    }

    const behaviorDir = path.join(engineDir, 'behaviors');
    try {
      const behaviorFiles = await readDir(behaviorDir);
      for (const behaviorFile of behaviorFiles) {
        if (behaviorFile.endsWith('.js'))
          necesaryFiles.push(path.join(behaviorDir, behaviorFile));
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.warn('No behaviors/ directory found in', engineDir);
      } else throw err;
    }

    console.log('Requiring', necesaryFiles.length, 'engine files from', engineDir, '...');
    for (const fullPath of necesaryFiles)
      require(fullPath);
  }
}
