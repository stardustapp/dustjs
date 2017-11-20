// accepts zero depth and presents the root node
class SingleSubscription {
  constructor(sub) {
    console.log('single sub started');
    this.sub = sub;
    this.api = {
      // TODO: stop: this.stop.bind(this),
      val: null,
    };
    this.status = 'Pending';
    this.forEachCbs = [];
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyCbs = {resolve, reject};
    });

    sub.channel.forEach(pkt => {
      var handler = this['on' + pkt.type];
      if (handler) {
        handler.call(this, pkt.path, pkt.entry);
      } else {
        console.warn('single sub did not handle', pkt);
      }
    });
  }

  stop() {
    return this.sub.stop();
  }

  // registers a callback for each change
  forEach(cb) {
    this.forEachCbs.push(cb);
    if (this.api.val !== null) {
      cb(this.api.val);
    }
  }

  onAdded(path, entry) {
    console.log('single: added ', entry);
    this.api.val = entry;
    this.forEachCbs.forEach(cb => cb(entry));
  }

  onChanged(path, entry) {
    console.log('single: changed from', this.api.val, 'to', entry);
    this.api.val = entry;
    this.forEachCbs.forEach(cb => cb(entry));
  }

  onRemoved(path) {
    console.log('single: removed');
    this.api.val = null;
    this.forEachCbs.forEach(cb => cb(null));
  }

  onReady() {
    console.log('Single subscription is ready.', this.api.val);
    if (this.readyCbs) {
      this.readyCbs.resolve(this.api);
      this.readyCbs = null;
    }
    this.status = 'Ready';
  }

  onError(_, error) {
    if (this.readyCbs) {
      this.readyCbs.reject(error);
      this.readyCbs = null;
    }
    this.status = 'Failed: ' + error;
  }
}