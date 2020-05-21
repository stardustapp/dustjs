const EnableNotifications = true;

const IrcBridgeHosts = [
  'example.com',
];

// Represents a mechanism for requesting historical entries
// from a non-sparse array-style log (1, 2, 3...)
// Accepts an array that entries are added into.
// A head entry is added immediately to anchor new log entries.
// No support for unloading entries yet :(
// TODO: rn always starts at latest and heads towards horizon
export class LazyBoundSequenceBackLog {
  constructor(partId, path, array, idx, mode) {
    this.id = partId;
    this.path = path;
    this.array = array;
    this.mode = mode;
    this.onNewItem = null;
    console.log('Starting log partition', partId, path, 'mode', mode);

    this.readyPromise = new Promise((resolve, reject) => {
      this.readyCbs = {resolve, reject};
    });
    this.completePromise = new Promise((resolve, reject) => {
      this.completeCbs = {resolve, reject};
    });

    this.header = {
      slot: 'partition-header',
      props: {
        partId: partId,
      },
    };
    if (idx === -1) {
      this.array.push(this.header);
    } else {
      this.array.splice(idx, 0, this.header);
    }
    this.latestItem = this.header;

    this.horizonId = null;
    this.oldestId = null;
    this.latestId = null;
    this.latestIdSub = null;

    var initPromise;

    // Backfill partitions are not expected to get new messages
    // Skip subscribing to latest
    if (this.mode == 'backfill') {
      initPromise = this.initBackfillPart(path);
    } else {
      initPromise = this.initLivePart(path);
    }

    initPromise.catch(err => {
      // log probably doesn't exist (TODO: assert that's why)
      console.warn('log setup error:', err);
      this.oldestId = -1;
      this.latestId = -1;
      this.horizonId = -1;
      this.readyCbs.resolve(-1);
      this.completeCbs.resolve(-1);
    });
  }

  initLivePart(path) {
    const horizonP = skylink
      .loadString('/'+path+'/horizon');
    const latestSubP = skylink
      .subscribe('/'+path+'/latest', {maxDepth: 0})
      .then(chan => new DustClient.SingleSubscription(chan))
      .then(sub => {
        this.latestIdSub = sub;
        return sub.readyPromise;
      });

    return Promise.all([horizonP, latestSubP]).then(([horizon, latest]) => {
      this.horizonId = +horizon;
      this.latestId = +latest.val;
      this.oldestId = +latest.val;
      //console.log(path, '- newest', this.latestId, ', horizon', this.horizonId);

      if (this.readyCbs) {
        this.readyCbs.resolve(this.latestId);
        this.readyCbs = null;
      }

      // Bleeding partitions should start at horizon and backfill in without gaps
      if (this.mode == 'bleeding-edge') {
        this.latestId = this.horizonId-1;
      } else if (this.mode == 'initial') {
        this.latestId--;
      } else {
        // this shouldn't happy, backfill modes hit different init logic
        console.log('log part', this.id, 'is in mode', this.mode, 'and is not streaming');
        return;
      }

      this.latestIdSub.forEach(newLatest => {
        const newLatestId = +newLatest;
        //console.log('Log partition', this.id, 'got new message sequence', newLatestId, '- latest was', this.latestId);

        while (newLatestId > this.latestId) {
          this.latestId++;
          const msg = {
            id: this.latestId,
            fullId: this.id+'/'+this.latestId,
            slot: 'entry',
            props: {},
          };
          const idx = this.array.indexOf(this.latestItem);
          this.array.splice(idx+1, 0, msg);
          this.latestId = this.latestId;
          this.latestItem = msg;
          const promise = this.loadEntry(msg);

          if (this.onNewItem) {
            this.onNewItem(this, this.latestId, promise);
          }
        }
      });
    });
  }

  initBackfillPart(path) {
    const horizonP = skylink
      .loadString('/'+path+'/horizon');
    const latestP = skylink
      .loadString('/'+path+'/latest');

    return Promise.all([horizonP, latestP]).then(([horizon, latest]) => {
      this.horizonId = +horizon;
      this.latestId = +latest;
      this.oldestId = +latest;
      console.log(path, '- newest', this.latestId, ', horizon', this.horizonId);

      if (this.readyCbs) {
        this.readyCbs.resolve(this.latestId);
        this.readyCbs = null;
      }

      // seed in the latest message, so we have something
      console.log('Log partition', this.id, 'seeding with latest message sequence', this.latestId);
      const msg = {
        id: this.latestId,
        fullId: this.id+'/'+this.latestId,
        slot: 'entry',
        props: {},
      };
      const idx = this.array.indexOf(this.latestItem);
      this.array.splice(idx+1, 0, msg);
      this.latestId = this.latestId;
      this.latestItem = msg;
      this.loadEntry(msg);
    });
  }

  stop() {
    if (this.latestIdSub) {
      this.latestIdSub.stop();
    }
  }

  // TODO: IRC SPECIFIC :(
  loadEntry(msg) {
    msg.path = this.path+'/'+msg.id;
    return skylink.enumerate('/'+msg.path, {maxDepth: 3}).then(list => {
      var props = {params: []};
      list.forEach(ent => {
        let name = ent.Name;
        let obj = props;

        if (name === 'raw') {
          props.raw = {};
          return;
        }
        if (name.startsWith('raw/')) {
          obj = props.raw;
          name = name.slice(4);
        }

        if (name === 'params') {
          obj.params = [];
          return;
        }
        if (name.startsWith('params/')) {
          obj.params[(+name.split('/')[1])-1] = ent.StringValue;
        } else if (ent.Type === 'String') {
          obj[name] = ent.StringValue;
        }
      });
      //console.debug(props);

      // Feature to rewrite certain messages in-memory before rendering them
      /*///////////
      if (props.command === 'NOTICE'
          && props['prefix-name'] === 'ircIsDead'
          && IrcBridgeHosts.includes(props['prefix-host'])) {
        props.juneBridged = true;
        const rawText = props['params'][1];
        if (rawText.startsWith('<')) {
          const author = rawText.slice(1, rawText.indexOf('> '));
          props['prefix-name'] = author[0] + author.slice(2); // remove ZWS
          props['params'][1] = rawText.slice(author.length+3);
        } else if (rawText.startsWith('-')) {
          const author = rawText.slice(1, rawText.indexOf('- '));
          props['prefix-name'] = `- ${author[0]}${author.slice(2)} -`; // remove ZWS
          props['params'][1] = rawText.slice(author.length+3);
        } else if (rawText.startsWith('*')) {
          const author = rawText.split(' ')[1];
          props['prefix-name'] = author[0] + author.slice(2); // remove ZWS
          props['params'][1] = rawText.replace(` ${author}`, '');
        }
      }
      //*/

      var mergeKey = false;
      if (['PRIVMSG', 'NOTICE', 'LOG'].includes(props.command) && props['prefix-name']) {
        mergeKey = [props.command, 'nick', props['prefix-name'], new Date(props.timestamp).getHours()].join(':');
      } else if (['JOIN', 'PART', 'QUIT', 'NICK'].includes(props.command)) {
        mergeKey = 'background';
      }
      // TODO: MODE that only affects users might as well get merged too

      //console.debug('got msg', msg.id, '- was', props);
      msg.mergeKey = mergeKey;
      msg.props = props;
      return msg;
    });
  }

  // Insert and load up to [n] older entries
  // Returns the number of entries inserted
  // If ret < n, no further entries will exist.
  request(n) {
    console.log("Log partition", this.id, "was asked to provide", n, "entries");
    let idx = 1 + this.array.indexOf(this.header);
    var i = 0;

    // the first entry comes from the setup
    if (this.oldestId == this.latestId && this.oldestId != -1) {
      i++;
    }

    for (; i < n; i++) {
      if (this.oldestId < 1) {
        console.log('Log partition', this.id, 'ran dry');
        if (this.completeCbs) {
          this.completeCbs.resolve(i);
          this.completeCbs = null;
        }
        return i;
      }

      const id = --this.oldestId;

      const msg = {
        id: id,
        fullId: this.id+'/'+id,
        slot: 'entry',
        mergeKey: false,
        props: {},
      };
      this.array.splice(idx, 0, msg);
      this.loadEntry(msg);
    }

    // made it to the end
    return n;
  }
}
