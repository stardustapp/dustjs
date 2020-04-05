const WebSocket = require('ws');
const {SkylinkClient} = require('./client.js');
const {InlineChannelClient} = require('./extensions/channel-client.js');

class WebsocketSkylinkClient extends SkylinkClient {
  constructor(endpoint) {
    super();
    this.endpoint = endpoint;

    this.waitingReceivers = new Array;
    this.isLive = true;
    this.ready = this.init();

    this.attach(new InlineChannelClient());
  }

  async init() {
    console.log(`Starting Skylink Websocket to ${this.endpoint}`);
    this.pingTimer = setInterval(() => this.volley({Op: 'ping'}), 30 * 1000);

    this.ws = new WebSocket(this.endpoint);
    this.ws.onmessage = msg => {
      const frame = JSON.parse(msg.data);
      this.receiveFrame(frame);
    };

    // wait for connection or failure
    try {
      await new Promise((resolve, reject) => {
        this.ws.onopen = resolve;
        this.ws.onclose = () => {
          reject('Skylink websocket has closed.'); // TODO: handle shutdown
          this.stop();
        };
        this.ws.onerror = err => {
          this.ws = null;
          reject(new Error(`Skylink websocket has failed. ${err}`));
        };
      });

    } catch (err) {
      // clean up after any error that comes before any open
      this.isLive = false;
      this.ws = null;

      throw err;
    }
  }

  stop(input=null) {
    if (this.ws) {
      console.log('Shutting down Websocket transport')
      clearInterval(this.pingTimer);
      this.ws.close();
    }

    const error = new Error(`Interrupted: Skylink WS transport was stopped`);
    this.waitingReceivers.forEach(x => {
      x.reject(error);
    });
    this.waitingReceivers.length = 0;

    this.handleShutdown(input);
  }

  volley(request) {
    return this.ready
      .then(() => new Promise((resolve, reject) => {
        this.waitingReceivers.push({resolve, reject});
        this.ws.send(JSON.stringify(request));
      }))
      .then(this.transformResp);
  }

  // triggered for packets from the server
  processFrame(frame) {
    const receiver = this.waitingReceivers.shift();
    if (receiver) {
      return receiver.resolve(frame);
    } else {
      throw new Error(`skylink received skylink payload without receiver`);
    }
  }

  /*
  return {
    channel: chan.map(entryToJS),
    stop: () => {
      console.log('skylink Requesting stop of chan', obj.Chan);
      return this.volley({
        Op: 'stop',
        Path: '/chan/'+obj.Chan,
      });
    },
  };*/
}

module.exports = {
  WebsocketSkylinkClient,
};
