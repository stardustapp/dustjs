import { Environment, SkylinkClientDevice, SkylinkServer } from '@dustjs/skylink'

import {ApiHandle} from './api-handle.js'
import {ApiSession} from './api-session.js'
import { createUserEnvironment } from './user-env.js'

class Automaton {
  constructor(apiSession, userEnv) {
    this.apiSession = apiSession;
    this.userEnv = userEnv;
    this.runtime = null;

    this.envServer = new SkylinkServer(userEnv);
  }

  publishRuntimeEnvironment(serviceName) {
    return this.apiSession.wsDevice.invoke('/pub/publish%20service/invoke',
      new FolderEntry('Publication', [
        new StringEntry('Session ID', this.apiSession.sessionId),
        new StringEntry('Service ID', serviceName),
        new DeviceEntry('Ref', this.runtime.env),
      ]));
  }

  getHandle(path) {
    return new ApiHandle(this.envServer, path);
  }

}

export class AutomatonBuilder {
  constructor() {
    this.osEnv = process.env;
    this.userMounts = new Array;
  }

  withHostEnvironment(osEnv) {
    this.osEnv = osEnv;
    return this;
  }
  withMount(envPath, sourceUrl) {
    this.userMounts.push({mount: envPath, target: sourceUrl});
    return this;
  }
  withMounts(mountList) {
    for (const entry of mountList) {
      this.userMounts.push(entry);
    }
    return this;
  }
  withRuntimeFactory(factoryFunc) {
    this.runtimeFactory = factoryFunc;
    return this;
  }
  withRuntimeConstructor(constrFunc) {
    this.runtimeFactory = userEnv => new constrFunc(userEnv);
    return this;
  }
  withServicePublication(serviceId) {
    this.servicePubId = serviceId;
    return this;
  }

  async launch() {
    try {
      // get a session with the user's auth server
      const apiSession = await ApiSession.findFromEnvironment(this.osEnv);
      console.group(); console.group();

      // set up namespace that the script has access to
      const userEnv = await createUserEnvironment(apiSession, this.userMounts);

      console.groupEnd(); console.groupEnd();
      console.log('==> Starting automaton');
      console.log();

      const automaton = new Automaton(apiSession, userEnv);
      automaton.runtime = this.runtimeFactory(automaton);

      if (this.servicePubId) {
        console.log(`--> Publishing our API surface as "${this.servicePubId}"...`);
        await automaton.publishRuntimeEnvironment(this.servicePubId);
      }

      await automaton.runtime.runNow();

      console.error();
      console.error('!-> Automaton completed.');
      process.exit(0);
    } catch (err) {
      console.error();
      console.error('!-> Automaton crashed:');
      console.error(err.stack || err);
      process.exit(1);
    }
  }
}
