const process = require('process');
const path = require('path');

const {SystemLoader} = require('./loader.js');
const {TopBase} = require('./top-base.js');
const {AsyncCache} = require('./utils/async-cache.js');

exports.DustMachine = class DustMachine {
  constructor(hostRuntime='nodejs') {
    this.hostRuntime = hostRuntime;

    this.driverCache = new AsyncCache;
    this.driverLoaders = new Array;

    const machineRoot = path.dirname(__dirname);
    this.addHostLoader(path.join(machineRoot, 'drivers'));

    const appRoot = process.cwd();
    if (appRoot !== machineRoot)
      this.addHostLoader(path.join(appRoot, 'drivers'));
  }
  addHostLoader(hostPath) {
    this.driverLoaders.push(new SystemLoader({
      hostDir: hostPath,
    }));
  }

  async findDriver(type, name) {
    const driverKey = `${type}.${name}`;
    for (const loader of this.driverLoaders) {
      if (!loader.canLoad(driverKey)) continue;
      return await loader.getDriver(driverKey);
    }
    throw new Error(`DUST Driver '${driverKey}' was not found`);
  }

  async loadDriver(type, name) {
    return this.driverCache.get(`${type}.${name}`, async input => {
      if (type === 'base' && name === 'base')
        return new TopBase(this);

      const driver = await this.findDriver(type, name)
      const base = await this.loadDriver('base', type);
      return await base.invokeEntity('CompileDriver', driver);

      // const builder = base._newNamedObject('DriverBuilder', this);
      // //await driver._compileSchema(builder);
      // console.log('builder of', type, 'is', builder);
      // return await builder.Make(driver);

      //return await base.MakeObject('Driver', this);
      //return await base._callLifecycle('buildDriverFactory', driver, this);
    });
  }

  async launchEngine(engineName, config) {
    const engine = await this.loadDriver('engine', engineName);
    console.log('Launching engine', engineName, '...');
    return await engine.launch(config);
  }

  async launchBackend(backendName, config) {
    const backend = await this.loadDriver('backend', backendName);
    console.log('Launching backend', backendName, '...', backend);
    return await backend.launch(config);
  }

  async runMain(mainFunc) {
    console.log(`==> Starting Main...`);
    try {
      await mainFunc();
      console.log();
      console.log(`==> Main has completed successfully.`);
      console.log(`    Letting nodejs loop idle.`);
      console.log();
    } catch (err) {
      console.debug();
      console.debug(`!!! Main has crashed!`);
      console.debug(err.stack);
      process.exit(3);
    }
  };
}
