const {Channel} = require('../api/channel.js');
const {StringEntry} = require('../api/entries/');

let allOpenChannels = 0;
// const metricsClock = setInterval(() => {
//   Datadog.Instance.gauge('skylink.server.open_channels', allOpenChannels, {});
// }, 10*1000);
// if (metricsClock.unref) {
//   metricsClock.unref();
// }

// for the server
class ChannelExtension {
  constructor() {
    this.channels = new Map;
    this.nextChan = 1;
  }

  attachTo(skylink) {
    skylink.shutdownHandlers.push(this.handleShutdown.bind(this));
    skylink.ops.set('stop', this.stopOpImpl.bind(this));
    skylink.env.mount('/channels/new', 'function', {
      invoke: this.newChannelFunc.bind(this),
    });
  }

  handleShutdown() {
    for (const chan of this.channels.values()) {
      chan.triggerStop(new StringEntry('reason', 'Skylink is shutting down'));
    }
    this.channels.clear();
  }

  newChannelFunc(input) {
    //Datadog.Instance.count('skylink.channel.opens', 1, {});
    allOpenChannels++;

    const chanId = this.nextChan++;
    const channel = new Channel(chanId);
    this.channels.set(chanId, channel);

    // Wire a way to async-signal the origin *once*
    const stopPromise = new Promise(resolve => {
      channel.triggerStop = resolve;
    });

    // Pass a simplified API to the thing that wanted the channel
    input({
      next(Output) {
        channel.handle({Status: 'Next', Output});
        //Datadog.Instance.count('skylink.channel.packets', 1, {status: 'next'});
      },
      error(Output) {
        channel.handle({Status: 'Error', Output});
        allOpenChannels--;
        //Datadog.Instance.count('skylink.channel.packets', 1, {status: 'error'});
      },
      done() {
        channel.handle({Status: 'Done'});
        allOpenChannels--;
        //Datadog.Instance.count('skylink.channel.packets', 1, {status: 'done'});
      },
      onStop(cb) {
        stopPromise.then(cb);
      },
    });
    return channel;
  }

  stopOpImpl(request) {
    const chanId = parseInt(request.Path.split('/')[2]);
    if (!this.channels.has(chanId)) {
      throw new Error(`Channel at ${request.Path} not found`);
    }

    const input = request.Input || new StringEntry('reason', 'Client called `stop`');
    return this.channels.get(chanId).triggerStop(input);
  }
}

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

module.exports = {
  ChannelExtension,
  InlineChannelCarrier,
};
