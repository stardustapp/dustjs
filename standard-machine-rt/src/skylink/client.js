class SkylinkClient {
  constructor() {
    // extension points
    this.outputDecoders = new Array;
    this.frameProcessors = new Array;
    this.shutdownHandlers = new Array;
  }

  attach(extension) {
    extension.attachTo(this);
  }

  decodeOutput(frame) {
    // let extensions decode custom framing
    for (const decoder of this.outputDecoders) {
      const result = decoder(output);
      if (result) return result;
    }

    // default to no transform
    return output;
  }

  handleShutdown(input) {
    for (const handler of this.shutdownHandlers) {
      handler(input);
    }
  }

  // TODO: by default, calls sendFrame() and queues for a receiveFrame() call
  // please either extend and replace, or integrate those two funcs so this impl works
  async volley(request) {
    throw new Error(`#TODO: impl volley() to do something lol`);
  }

  receiveFrame(frame) {
    // let extensions override the whole frame
    for (const processor of this.frameProcessors) {
      const result = processor(frame);
      if (result) return;
    }

    // fallback to impl default
    this.processFrame(frame);
  }
}

class StatelessHttpSkylinkClient extends SkylinkClient {
  constructor(endpoint) {
    super();
    this.endpoint = endpoint;
  }

  async volley(request) {
    const resp = await fetch(this.endpoint, {
      method: 'POST',
      body: JSON.stringify(request),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (resp.status < 200 || resp.status >= 300)
      throw new Error(`Skylink op failed with HTTP ${resp.status}`);
    return resp.json();
  }
}

// Used for WebWorkers and such
// You pass received frames to receiveFrame() and impl sendFrame()
// Your eventObj should have postMessage(data) and call its onmessage(evt)
// IDs are attached to each message, so it's not lockstep
// You can have a Client & Server on both sides via the Reversal extension
class MessagePassingSkylinkClient extends SkylinkClient {
  constructor(eventObj) {
    super();

    // wire our send and receive to the given I/O interface
    this.postMessage = eventObj.postMessage.bind(eventObj);
    eventObj.onmessage = this.processMessageEvent.bind(this);

    this.pendingIds = new Map;
    this.nextId = 1;
  }

  async volley(request) {
    request.Id = this.nextId++;

    // send request and await response
    const response = await new Promise(resolve => {
      this.pendingIds.set(request.Id, {request, resolve});
      this.postMessage(request);
    });
    return response;
  }

  processMessageEvent(evt) {
    // Attach the passed port, if any
    if (evt.ports.length)
      evt.data._port = evt.ports[0];
    else if ('_port' in evt.data)
      throw new Error(`BUG: _port was already present on passed message`);

    // Submit for processing
    this.receiveFrame(evt.data);
  }

  processFrame(frame) {
    const {Id} = frame;

    if (this.pendingIds.has(Id)) {
      const future = this.pendingIds.get(Id);
      this.pendingIds.delete(Id);
      future.resolve(frame);

    } else {
      throw new Error(`BUG: skylink message-passer got message for non-pending thing`);
    }
  }
}

class WebsocketSkylinkClient extends SkylinkClient {
  constructor(endpoint) {
    super();
    this.endpoint = endpoint;

    this.waitingReceivers = new Array;
    this.isLive = true;
    this.ready = this.init();
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

  // triggered by volley()
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

if (typeof module !== 'undefined') {
  module.exports = {
    SkylinkClient,
    StatelessHttpSkylinkClient,
    MessagePassingSkylinkClient,
    WebsocketSkylinkClient,
  };
}
