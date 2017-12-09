class ResumableSub {
  constructor(label, initialChannel, channelGetter) {
    this.label = label;
    this.channelGetter = channelGetter;

    this.stopCb = null;
    this.channel = new Channel(label);
    this.cache = new Map();
    this.unSyncedKeys = new Set();

    this.stop = this.stop.bind(this);
    this.state = 'Startup';

    this.wireChannel(initialChannel);
  }

  sendNotif(type, path, entry) {
    this.channel.handle({
      Status: 'Next',
      Output: {type, path, entry},
    });
  }

  handleNotif({type, path, entry}) {
    // Trigger reconsile logic when resyncing
    if (this.state == 'Resyncing') {
      //console.log('resyncing', type, 'path', path);
      switch (type) {
        case 'Added':
          this.unSyncedKeys.delete(path);
          if (this.cache.has(path)) {

            // compare previous and new entries
            const prevEnt = this.cache.get(path);
            if (prevEnt.constructor == Object && entry.constructor == Object) {
              // both are folders, move on
            } else if (prevEnt != entry||'') {
              // they're primitives and they're DIFFERENT
              this.sendNotif('Changed', path, entry);
              this.cache.set(path, entry||'');
              console.log('resync saw change:', path, prevEnt, entry);
            }

          } else {
            // we didn't have this path last time
            // let's pass it down
            this.sendNotif(type, path, entry);
            this.cache.set(path, entry||'');
          }
          break;

        case 'Ready':
          console.log('completing resync of', this.label);
          // set first in case the Removed crashes
          this.state = 'Ready';

          // TODO: removing a prefix implicitly removes its children
          this.unSyncedKeys.forEach(key => {
            console.warn('resync of', this.label, 'removing key', key);
            this.sendNotif('Removed', key, null);
          });

          this.unSyncedKeys.clear();
          break;

        default:
          console.warn('resumable sub', this.label, 'got unhandled', type, 'during resync');
      }

    } else {
      switch (type) {
        case 'Added':
        case 'Changed':
          this.cache.set(path, entry||'');
          break;

        case 'Ready':
          this.state = 'Ready';
          break;

        default:
          console.warn('resumable sub', this.label, 'got unhandled', type);
      }
      this.sendNotif(type, path, entry);
    }
  }

  wireChannel({channel, stop}) {
    this.stopCb = stop;

    channel.forEach(val => {
      this.handleNotif(val);
      //this.channel.handle({Status: 'Next', Output: val});
    }, err => {
      this.state = 'Crashed: Channel lost: ' + JSON.stringify(err);
      console.log('Resumable sub', this.label, 'got Error:', err);
      this.timer = setTimeout(() => {
        console.log('Reconnecting sub', this.label);
        this.reconnect();
      }, 3 * 1000);
    }, val => {
      this.state = 'Completed';
      console.log('Resumable sub', this.label, 'stopped.', val);
      this.channel.handle({Status: 'Done', Output: val});
    });
  }

  reconnect() {
    this.state = 'Reconnecting';
    this.unSyncedKeys = new Set();
    this.cache.forEach((val, key) => {
      this.unSyncedKeys.add(key);
    });

    console.log('tring to reconnect resumable sub', this.label);
    this.channelGetter().then(channel => {
      console.log('resumable sub got new channel okay for', this.label);
      this.state = 'Resyncing';
      this.wireChannel(channel);
    }, err => {
      this.state = 'Crashed: Reconnect failed: ' + JSON.stringify(err);
      console.log('Resumable sub', this.label, 'still cannot connect, got error:', err, '- waiting longer');
      this.timer = setTimeout(() => {
        console.log('Reconnecting sub', this.label);
        this.reconnect();
      }, 10 * 1000);
    });
  }

  stop() {
    console.log('stopping resumable sub', this.label);
    if (this.stopCb) {
      this.stopCb();
    } else {
      console.warn('resumable sub', this.label, 'cant be stopped - got leaked');
    }
  }
}

window.subs = [];
class SkylinkMount {
  constructor({endpoint, path, stats}, updateStatus) {
    this.endpoint = endpoint;
    this.path = path;
    this.stats = stats;

    this.updateStatus = updateStatus;

    this.api = {};
    this.liveSubs = [];
    this.buildApis();

    // timer to check on subs and represent in mount status
    setInterval(() => {
      this.liveSubs = this.liveSubs.filter(x => x.state != 'Completed');
      const pendingSubs = this.liveSubs.filter(x => x.state != 'Ready').length;

      if ((this.status == 'Connected' || this.status == 'Pending') && !pendingSubs) {
        this.status = 'Ready';
        this.updateStatus();
      } else if ((this.status == 'Connected' || this.status == 'Ready') && pendingSubs) {
        this.status = 'Pending';
        this.updateStatus();
      }
    }, 1000);

    this.connect();
  }

  buildApis() {
    ALL_OPS.forEach(op => {
      this.api[op] = (...args) => {
        return this.skylink[op](...args);
      };
    });

    this.api.subscribe = (path, ...args) => {
      console.log('skylink mount got subscribe on', args);

      const promise = this.skylink.subscribe(path, ...args);
      return promise.then(sub => {
        const newSub = new ResumableSub(path, sub, () => {
          if (this.skylink) {
            return this.skylink.subscribe(path, ...args);
          } else {
            return Promise.reject('Skylink is not re-established yet');
          }
        });
        this.liveSubs.push(newSub);
        return newSub;
      });

      //return Promise.reject("subscribe not implemented");
    };
  }

  connect() {
    this.status = 'Connecting...';
    this.updateStatus();

    this.skylink = new Skylink(this.path, this.endpoint, this.stats);
    this.skylink.transport.connPromise.then(() => {
      this.status = 'Connected';
      this.updateStatus();
    });

    this.skylink.transport.donePromise.then(() => {
      this.status = 'Offline';
      this.skylink = null;
      this.updateStatus();
      // TODO: autoreconnect shuold be configurable
      setTimeout(() => this.connect(), 5000);
    }, (err) => {
      this.status = 'Crashed';
      this.updateStatus();
      throw err;
    });
  }
}