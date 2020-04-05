const {Channel} = require('../api/channel.js');

// Detects a 'Chan' field on normal responses and reroutes them to Channel objects
class InlineChannelClient {
  constructor(sendCb) {
    this.sendCb = sendCb;
    this.channels = new Map;
  }

  attachTo(skylink) {
    skylink.outputDecoders.push(this.decodeOutput.bind(this));
    skylink.frameProcessors.push(this.processFrame.bind(this));
    skylink.shutdownHandlers.push(this.handleShutdown.bind(this));
  }

  // Build Channel objects for output
  decodeOutput(frame) {
    if (frame.Chan && frame.Status === 'Ok') {
      const chan = new Channel(frame.Chan);
      this.channels.set(frame.Chan, this.channels);
      return chan;
    }
  }

  // Pass events to existing Channels
  processFrame(frame) {
    // Detect and route continuations
    if (frame.Chan && frame.Status !== 'Ok') {
      // find the target
      const chan = this.channels.get[frame.Chan];
      if (!chan) throw new Error(`Skylink received unroutable channel packet inline`);

      // pass the message
      chan.handle(d);
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

module.exports = {
  InlineChannelClient,
};
