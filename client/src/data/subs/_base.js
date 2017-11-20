class Subscription {
  constructor(channel) {
    this.paths = new Map();
    this.status = 'Pending';
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyCbs = {resolve, reject};
    });

    channel.forEach(pkt => {
      var handler = this['on' + pkt.type];
      if (handler) {
        handler.call(this, pkt.path, pkt.entry);
      } else {
        console.warn('sub did not handle', pkt);
      }
    });
  }

  onAdded(path, entry) {
    this.paths.set(path || '', entry);
  }

  onReady() {
    console.log('Subscription is ready.', this.paths);
  }

  onError(_, error) {
    if (this.readyCbs) {
      this.readyCbs.reject(error);
      this.readyCbs = null;
    }
    this.status = 'Failed: ' + error;
  }
}
