import {Channel} from '../api/channel.js';
import {InflateSkylinkLiteral} from '../api/entries/index.js';

// Detects a 'Chan' field on normal responses and reroutes them to Channel objects
export class InlineChannelClient {
  constructor(sendCb) {
    this.sendCb = sendCb;
    this.channels = new Map;
  }

  attachTo(skylink) {
    skylink.outputDecoders.push(this.decodeOutput.bind(this));
    skylink.frameProcessors.push(this.processFrame.bind(this));
    skylink.shutdownHandlers.push(this.handleShutdown.bind(this));

    // used to stop channels
    Object.defineProperty(this, '_client', {
      value: skylink,
    });
  }

  // Build Channel objects for output
  decodeOutput(frame) {
    if (frame.Chan && frame.Status === 'Ok') {
      console.log('skylink client received new channel', frame.Chan);

      const chan = new Channel(frame.Chan);
      this.channels.set(frame.Chan, chan);

      return {
        channel: chan.map(InflateSkylinkLiteral),
        stop: () => {
          // TODO?: drop new packets until the stop is ack'd ??
          return this._client.performOp({
            Op: 'stop',
            Path: '/chan/'+frame.Chan,
          });
        },
      };
    }
  }

  // Pass events to existing Channels
  processFrame(frame) {
    // Detect and route continuations
    if (frame.Chan && frame.Status !== 'Ok') {
      // find the target
      const chan = this.channels.get(frame.Chan);
      if (!chan) throw new Error(`Skylink received unroutable channel packet inline`);

      // pass the message
      chan.handle(frame);
      if (frame.Status !== 'Next') {
        // clean up terminal channels
        this.channels.delete(frame.Chan);
      }
      return true;
    }
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
