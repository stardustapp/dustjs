// accepts one depth and presents one reactive object once ready
class FlatSubscription {
  constructor(sub, vm) {
    //console.log('flat sub started');
    this.sub = sub;
    this.vm = vm;
    this.fields = {};
    this.status = 'Pending';
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyCbs = {resolve, reject};
    });

    sub.channel.forEach(pkt => {
      var handler = this['on' + pkt.type];
      if (handler) {
        handler.call(this, pkt.path, pkt.entry);
      } else {
        console.warn('sub did not handle', pkt);
      }
    });
  }

  stop() {
    return this.sub.stop();
  }

  onAdded(path, entry) {
    if (path) {
      //console.log('flat: added', path, entry);
      if (this.vm) {
        this.vm.$set(this.fields, path, entry);
      } else {
        this.fields[path] = entry;
      }
    }
  }

  onChanged(path, entry) {
    if (path) {
      //console.log('flat: changed', path, 'from', this.fields[path], 'to', entry);
      this.fields[path] = entry;
    }
  }

  onRemoved(path) {
    if (path) {
      //console.log('flat: removed', path);
      this.fields[path] = null;
    }
  }

  onReady() {
    //console.log('Flat subscription is ready.', this.fields);
    if (this.readyCbs) {
      this.readyCbs.resolve(this.fields);
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