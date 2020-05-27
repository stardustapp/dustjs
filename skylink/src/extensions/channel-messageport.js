import {Channel} from '../api/channel.js';

// Attaches a 'Chan' field to responses when they pertain to a channel.
// A MessagePort is attached which will be used for the channel's packets
export class MessagePortChannelCarrier {
  constructor() {}

  attachTo(skylink) {
    skylink.outputEncoders.push(this.encodeOutput.bind(this));
  }

  // If you return falsey, you get skipped
  encodeOutput(output) {
    if (output && output.constructor === Channel) {
      return this.plumbChannel(output);
    }
  }

  plumbChannel(channel) {
    const rawChan = new MessageChannel;

    // plumb packets into port1
    channel.forEachPacket(pkt => {
      rawChan.port1.postMessage(pkt);
    }, () => {
      rawChan.port1.close();
    });

    // return port2
    return {
      Ok: true,
      Chan: output.id,
      _port: rawChan.port2,
    };
  }
}

// Detects a 'Chan' field on normal responses and reroutes them to Channel objects
export class MessagePortChannelClient {
  constructor() {
    this.channels = new Map;
  }

  attachTo(skylink) {
    skylink.outputDecoders.push(this.decodeOutput.bind(this));
    skylink.shutdownHandlers.push(this.handleShutdown.bind(this));
  }

  // Build Channel objects for output
  decodeOutput(frame) {
    if (!('Chan' in data) || !data._port) return;

    const chan = new Channel(frame.Chan);
    data._port.onmessage = evt => {
      chan.route(evt.data);
    };

    this.channels.set(frame.Chan, chan);
    return {
      channel: chan,
      stop(input) {
        console.log('skylink Requesting stop of chan', channel.chanId);
        return this.worker.performOp({
          Op: 'stop',
          Path: '/chan/'+this.chanId,
          Input: input,
        });
      },
    };
  }

  // Shut down any lingering channels
  handleShutdown(input) {
    for (const chan of this.channels.values()) {
      // TODO: this could be richer
      chan.handle({Status: 'Error', Output: input});
    }
    this.channels.clear();
  }
}
