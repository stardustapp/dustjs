const {
  Environment,
  FolderEntry, StringEntry, InflateSkylinkLiteral,
  LiteralDevice, FunctionDevice,
} = require('@dustjs/skylink');

const {
  LuaContext, LuaMachine, LuaThread,
} = require('./copied-from-dust-server/lua-machine.js');

exports.AppRuntime = class AppRuntime {
  constructor(appId, userEnv) {
    this.status = 'Pending';
    this.processes = new Array; // TODO: skylink api
    this.userEnv = userEnv;

    // set up the skylink API for a runtime
    this.env = new Environment;
    this.env.bind('/app-name', LiteralDevice.ofString(appId));
    this.env.bind('/namespace', this.userEnv);
    // this.env.bind('/processes', {getEntry(){}});
    this.env.bind('/restart', new FunctionDevice({
      async invoke(input) {
        // const {idToken, appId} = input;
        console.log('TODO: restarting runtime', input);
        return { Type: 'String', StringValue: 'todo' };
      }}));
    this.env.bind('/start-routine', new FunctionDevice({
      async invoke(input) {
        // const {idToken, appId} = input;
        console.log('TODO: starting routine', input);
        return { Type: 'String', StringValue: 'todo' };
      }}));
    this.env.bind('/state', { getEntry: path => this.getStateEntry(path) });

  }

  async launch(input=null) {
    this.machine = new LuaMachine(this.userEnv);
    this.thread = this.machine.startThread();

    const sourceEntry = await this.userEnv.getEntry('/source/launch.lua');
    if (!sourceEntry) throw new Error(
      `Failed to access the /source device. Did you mount it?`)

    if (sourceEntry.subscribe) {
      const rawSub = await sourceEntry.subscribe();
      await new Promise(resolve => {
        const sub = new SingleSubscription(rawSub);
        sub.forEach(literal => {
          this.thread.compileFrom(literal);

          resolve && resolve();
          resolve = null;
        });
      });
    } else {
      const literal = await sourceEntry.get();
      this.thread.compileFrom(literal);
    }

    await this.thread.run(input);
  }

  async getStateEntry(path) {
    if (path) throw new Error(
      `literal devices have no pathing`);
    return {
      // TODO: probably impl subscribe() lol
      get: () => {
        return Promise.resolve(new StringEntry('state', this.status));
      },
    };
  }
}
