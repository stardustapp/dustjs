import { StatelessHttpSkylinkClient } from '../client-http.js';
import { WebsocketSkylinkClient } from '../client-websocket.js';

export class SkylinkClientDevice {
  constructor(remote, pathPrefix) {
    this.remote = remote;
    this.pathPrefix = pathPrefix;

    // copy promise from remote
    this.ready = Promise.resolve(remote.ready)
      .then(() => remote.performOp({Op: 'ping'}));
    this.closed = new Promise(resolve => this.markClosed = resolve);
  }

  getEntry(path) {
    return new SkylinkClientEntry(this.remote, this.pathPrefix + path);
  }

  getSubRoot(path) {
    if (path === '') return this;
    return new SkylinkClientDevice(this.remote, this.pathPrefix + path);
  }

  static fromUri(uri) {
    if (!uri.startsWith('skylink+')) throw new Error(
      `BUG: SkylinkClientDevice given non-skylink URI of scheme "${uri.split('://')[0]}"`);

    const parts = uri.slice('skylink+'.length).split('/');
    const scheme = parts[0].slice(0, -1);
    const endpoint = parts.slice(0, 3).join('/') + '/~~export' + (scheme.startsWith('ws') ? '/ws' : '');
    const remotePrefix = ('/' + parts.slice(3).join('/')).replace(/\/+$/, '');

    if (scheme.startsWith('http')) {
      const skylink = new StatelessHttpSkylinkClient(endpoint);
      return new SkylinkClientDevice(skylink, remotePrefix);

    } else if (scheme.startsWith('ws')) {
      const skylink = new WebsocketSkylinkClient(endpoint);

      // TODO: works around irc-modem flaw with 'tags'
      // { Name: 'tags', Type: 'Unknown' }
      skylink.extraInflaters.set('Unknown', raw => ({Type: 'Unknown', Name: raw.Name}));

      const wsDevice = new SkylinkClientDevice(skylink, '/pub'+remotePrefix);
      skylink.shutdownHandlers.push(() => {
        skylink.ready = Promise.reject(new Error(`Skylink WS transport has been disconnected`));
        // TODO: either try reconnecting, or just shut the process down so it can restart
        wsDevice.markClosed();
      });
      return wsDevice;

    } else {
      throw new Error(`BUG: Tried importing a skylink of unknown scheme "${scheme}"`);
    }
  }
}

export class SkylinkClientEntry {
  constructor(remote, path) {
    this.remote = remote;
    this.path = path;
  }

  get() {
    return this.remote.performOp({
      Op: 'get',
      Path: this.path,
    });
  }

  async enumerate(enumer) {
    const response = await this.remote.performOp({
      Op: 'enumerate',
      Path: this.path||'/',
      Depth: enumer.remainingDepth(),
    });

    // transclude the remote enumeration
    enumer.visitEnumeration(response.Output);
  }

  put(value) {
    return this.remote.performOp((value === null) ? {
      Op: 'unlink',
      Path: this.path,
    } : {
      Op: 'store',
      Dest: this.path,
      Input: value,
    });
  }

  invoke(value) {
    return this.remote.performOp({
      Op: 'invoke',
      Path: this.path,
      Input: value,
    });
  }

  async subscribe(depth, newChannel) {
    console.log('starting remote sub to', this.path);
    const response = await this.remote.performOp({
      Op: 'subscribe',
      Path: this.path,
      Depth: depth,
    });

    const {channel, stop} = response;
    return newChannel.invoke(async c => {
      // proxy between remote and local channel
      channel.forEach(c.next, c.error, c.done);
      c.onStop(() => stop());
    });
  }
}
