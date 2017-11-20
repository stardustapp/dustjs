// compare to Rx Observable
class Channel {
  constructor(id) {
    this.id = id;
    this.queue = ['waiting'];

    this.burnBacklog = this.burnBacklog.bind(this);
  }

  // add a packet to process after all other existing packets process
  handle(packet) {
    this.queue.push(packet);
    if (this.queue.length == 1) {
      // if we're alone at the front, let's kick it off
      this.burnBacklog();
    }
  }

  start(callbacks) {
    this.callbacks = callbacks;
    var item;
    console.log('Starting channel #', this.id);
    this.burnBacklog();
    while (item = this.queue.shift()) {
      this.route(item);
    }
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


  forEach(effect) {
    this.start({
      onNext(x) {
        effect(x.Output);
      },
      onError(x) { chan.handle(x); },
      onDone(x) { chan.handle(x); },
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