const {Channel} = require('../old/channel.js');

// Attaches a 'Chan' field to responses when they pertain to a channel.
// The client gets packets over the original connection and use 'Chan' to differentiate them.
class InlineChannelCarrier {
  constructor(sendCb) {
    this.sendCb = sendCb;
  }

  attachTo(skylink) {
    skylink.outputEncoders.push(this.encodeOutput.bind(this));
  }

  // If you return falsey, you get skipped
  encodeOutput(output) {
    if (output && output.constructor === Channel) {
      return {
        Ok: true,
        Status: 'Ok',
        Chan: output.id,
        _after: this.plumbChannel.bind(this, output),
      };
    }
  }

  plumbChannel(channel) {
    channel.forEachPacket(pkt => {
      pkt.Chan = channel.id;
      this.sendCb(pkt);
    }, () => {/* already handled */});
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    InlineChannelCarrier,
  };
}
