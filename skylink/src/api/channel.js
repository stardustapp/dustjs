// compare to Rx Observable
class Channel {
  constructor(id) {
    this.id = id;
    this.queue = ['waiting'];
    this.callbacks = {};
    this.alive = true;

    this.burnBacklog = this.burnBacklog.bind(this);
  }

  // add a packet to process after all other existing packets process
  handle(packet) {
    if (!this.alive) throw new Error(
      `Channel isn't alive`);

    this.queue.push(packet);
    if (this.queue.length == 1 && this.callbacks) {
      // if we're alone at the front, let's kick it off
      this.burnBacklog();
    }

    if (packet.Status !== 'Next') {
      this.alive = false;
    }
  }

  start(callbacks) {
    this.callbacks = callbacks;
    var item;
    //console.log('Starting channel #', this.id);
    return this.burnBacklog();
    // while (item = this.queue.shift()) {
    //   this.route(item);
    // }
  }

  burnBacklog() {
    const item = this.queue.shift();
    if (item === 'waiting') {
      // skip dummy value
      return this.burnBacklog();
    } else if (item) {
      return this.route(item).then(this.burnBacklog);
    }
  }

  route(packet) {
    const callback = this.callbacks['on' + packet.Status];
    if (callback) {
      return callback(packet) || Promise.resolve();
    } else {
      console.log("Channel #", this.id, "didn't handle", packet);
      return Promise.resolve();
    }
  }

  /////////////////
  // Public API

  // Like forEach but you are given every packet unwrapped, and simply told when there are no more coming.
  forEachPacket(effect, finisher) {
    if (!finisher) {
      finisher = (pkt) => {
        console.log('Channel #', this.id, 'came to an end. No one cared.');
      };
    }

    this.start({
      onNext: effect,
      onError(x) {
        effect(x);
        finisher();
      },
      onDone(x) {
        effect(x);
        finisher();
      },
    })
  }

  // You give a main callback, and two different finishers
  forEach(effect, errorFinisher, doneFinisher) {
    if (!errorFinisher) {
      errorFinisher = (pkt) => {
        console.warn('Channel #', this.id, "encountered an Error,",
                     "but no finalizer was added to handle it.", pkt);
      };
    }
    if (!doneFinisher) {
      doneFinisher = (pkt) => {
        console.log('Channel #', this.id, 'came to an end. No one cared.');
      };
    }

    this.start({
      onNext(x) {
        effect(x.Output);
      },
      onError(x) {
        errorFinisher(x.Output);
      },
      onDone(x) {
        doneFinisher(x.Output);
      },
    });
    return new Channel('void');
  }

  map(transformer) {
    const chan = new Channel(this.id + '-map');
    this.start({
      onNext(x) { chan.handle({
        Status: x.Status,
        Output: transformer(x.Output), // TODO: rename Value
      }); },
      onError(x) { chan.handle(x); },
      onDone(x) { chan.handle(x); },
    });
    return chan;
  }

  filter(selector) {
    const chan = new Channel(this.id + '-filter');
    this.start({
      onNext(x) {
        if (selector(x.Output)) {
          chan.handle(x);
        }
      },
      onError(x) { chan.handle(x); },
      onDone(x) { chan.handle(x); },
    });
    return chan;
  }
}

module.exports = {
  Channel,
};
