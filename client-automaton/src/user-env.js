import { Environment, SkylinkClientDevice } from '@dustjs/skylink';

// export { ApiSession } from './api-session.js';
// export { ApiHandle } from './api-handle.js';

export async function createUserEnvironment(apiSession, mounts) {
  // set up namespace that the calling application will have access to
  const userEnv = new Environment('automaton:');
  for (const {mount, target} of mounts) {
    switch (true) {

      case target === 'temp://':
        const tmpDevice = new TempDevice();
        await userEnv.bind(mount, tmpDevice);
        break;

      case target.startsWith('skylink+'):
        const remoteDevice = SkylinkClientDevice.fromUri(target);
        await userEnv.bind(mount, remoteDevice);
        break;

      case target.startsWith('file://'):
        const fsDevice = FilesystemDevice.fromUri(target);
        await userEnv.bind(mount, fsDevice);
        break;

      case target.startsWith('session:'):
        const subPath = `/${target.slice(8).replace(/^\/\/?/, '')}`.replace(/\/$/, '');
        const sessDevice = await apiSession.createMountDevice(subPath);
        await userEnv.bind(mount, sessDevice);
        break;

      default: throw new Error(
        `Given mount ${mount} specifies unsupported target URI: "${target}"`);
    }
  }

  return userEnv;
}
