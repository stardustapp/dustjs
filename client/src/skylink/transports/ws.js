class SkylinkWsTransport {
  constructor(endpoint, stats) {
    this.endpoint = endpoint;
    this.stats = stats;
    this.waitingReceivers = [];
    this.channels = {};

    this.transformResp = this.transformResp.bind(this);

    this.reset();
    this.pingTimer = setInterval(() => this.exec({Op: 'ping'}), 30 * 1000);
  }

  // TODO: report the state discontinuity downstream
  reset() {
    if (this.ws) {
      console.log('Resetting Websocket transport');
      this._stop();
    }

    this.connPromise = new Promise((resolve, reject) => {
      console.log(`Starting Skylink Websocket to ${this.endpoint}`);

      this.ws = new WebSocket(this.endpoint);
      this.ws.onmessage = msg => {
        const d = JSON.parse(msg.data);

        // Detect and route continuations
        if (d.Chan && d.Status != "Ok") {
          // find the target
          const chan = this.channels[d.Chan];
          if (!chan) {
            console.warn("skylink received unroutable packet:", d);
            return;
          }

          // pass the message
          chan.handle(d);
          this.stats.pkts++;
          if (d.Status !== "Next") {
            delete this.channels[d.Chan];
            this.stats.chans--;
          }
          return;

        } else {
          // Not a continuation. Process w/ next lockstep receiver.
          const receiver = this.waitingReceivers.shift();
          if (receiver) {
            return receiver.resolve(d);
          }
        }

        console.warn("skylink received skylink payload without receiver:", d);
      };

      this.ws.onopen = () => resolve();
      this.ws.onclose = () => {
        if (this.ws != null) {
          // this was unexpected
          console.log('Auto-reconnecting Skylink websocket post-close');
          this.reset();
        }
      };
      this.ws.onerror = () => {
        this.ws = null; // prevent reconnect onclose
        reject(new Error(`Error opening skylink websocket. Will not retry.`));
      };

      return this.connPromise;
    })

    // make sure the new connection has what downstream needs
    this.connPromise
      .then(() => {
        console.log('Websocket connection ready - state checks passed');
      }, err => {
        alert(`New Skylink connection failed the healthcheck.\nYou may need to restart the app.\n\n${err}`);
        console.log('Websocket connection checks failed', err);
      });
  }

  // gets a promise for a live connection, possibly making it
  getConn() {
    if (this.ws && this.ws.readyState > 1) {
      console.warn(`Reconnecting Skylink websocket on-demand due to readyState`);
      this.reset();
    }
    if (this.connPromise !== null) {
      return this.connPromise;
    } else {
      return Promise.reject(`Websocket transport is stopped.`);
    }
  }

  start() {
    return this.getConn()
    .then(() => this.exec({Op: 'ping'}));
  }

  _stop() {
    this.ws = null;

    const error = new Error(`Interrupted: Skylink WS transport was stopped`);
    this.waitingReceivers.forEach(x => {
      x.reject(error);
    });
    this.waitingReceivers.length = 0;
  }

  stop() {
    console.log('Shutting down Websocket transport');
    if (this.ws) {
      this.ws.close();
    }
    clearInterval(this.pingTimer);

    this._stop();
    this.connPromise = null;
  }

  exec(request) {
    return this.getConn()
      .then(() => new Promise((resolve, reject) => {
        this.waitingReceivers.push({resolve, reject});
        this.ws.send(JSON.stringify(request));
      }))
      .then(this.transformResp);
  }

  // Chain after a json promise with .then()
  transformResp(obj) {
    if (!(obj.ok === true || obj.Ok === true || obj.Status === "Ok")) {
      //alert(`Stardust operation failed:\n\n${obj}`);
      this.stats.fails++;
      return Promise.reject(obj);
    }

    // detect channel creations and register them
    if (obj.Chan) {
      this.stats.chans++;
      console.log('skylink creating channel', obj.Chan);
      const chan = new Channel(obj.Chan);
      this.channels[obj.Chan] = chan;
      return {
        channel: chan.map(entryToJS),
        stop: () => {
          console.log('skylink Requesting stop of chan', obj.Chan);
          return this.exec({
            Op: 'stop',
            Path: '/chan/'+obj.Chan,
          });
        },
      };
    }

    return obj;
  }
}
