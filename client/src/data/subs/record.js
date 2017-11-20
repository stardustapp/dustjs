// Supports 2-deep subscriptions of format:
// /:id - a document with unique/arbitrary id
// /:id/:field - string fields of document
// documents are presented as vanilla objects
class RecordSubscription {
  constructor(sub, opts) {
    this.sub = sub;
    this.basePath = opts.basePath;
    this.fields = opts.fields || [];
    this.filter = opts.filter || {};
    this.stats = {
      hidden: 0,
    };

    this.idMap = new Map();
    this.items = new Array();
    this.status = 'Pending';
    // TODO: this.currentId = ''; // used during startup

    this.readyPromise = new Promise((resolve, reject) => {
      this.readyCbs = {resolve, reject};
    });

    sub.channel.forEach(pkt => {
      var handler = this['on' + pkt.type];
      if (handler) {
        handler.call(this, pkt.path, pkt.entry);
      } else {
        console.warn('record sub did not handle', pkt);
      }
    });
  }

  stop() {
    return this.sub.stop();
  }

  insertDoc(id, doc) {
    const properIdx = this.items.findIndex(x => x._id > id);
    if (properIdx === -1) {
      this.items.push(doc);
    } else {
      this.items.splice(properIdx, 0, doc);
    }
  }

  onAdded(path, entry) {
    if (!path) {
      // root entry: ignore
      return;
    }

    const parts = path.split('/');
    if (parts.length == 1) {
      // new document
      const [id] = parts;
      const doc = {
        _id: id,
        _path: this.basePath + '/' + id,
      };
      this.fields.forEach(x => doc[x] = null);

      // store it
      this.idMap.set(id, doc);
      if (Object.keys(this.filter).length == 0) {
        this.insertDoc(id, doc);
      } else {
        this.stats.hidden++;
      }

    } else if (parts.length == 2) {
      // add field to existing doc
      const [id, field] = parts;
      const doc = this.idMap.get(id);
      //switch (entry.Type)
      doc[field] = entry || '';

      // check filter
      if (field in this.filter) {
        if (doc[field] === this.filter[field]) {
          const idx = this.items.indexOf(doc);
          if (idx === -1) {
            this.stats.hidden--;
            this.insertDoc(id, doc);
          }
          //console.log('dropping document', id, 'due to filter on', field);
          //const idx = this.items.indexOf(doc);
          //if (idx >= 0) {
          //  this.items.splice(idx, 1);
          //}
        } else {
          // filter fails
          const idx = this.items.indexOf(doc);
          if (idx !== -1) {
            this.stats.hidden++;
            this.items.splice(idx, 1);
          }
        }
      }
    }
  }

  onChanged(path, entry) {
    if (!path) {
      // root entry: ignore
      return;
    }

    const parts = path.split('/');
    if (parts.length == 1) {
      // replaced document
      console.warn('recordsub got changed packet for entire document. not implemented!', path, entry);

    } else if (parts.length == 2) {
      // changed field on existing doc
      const [id, field] = parts;
      const doc = this.idMap.get(id);
      //switch (entry.Type)

      // check filter
      if (field in this.filter) {
        const didMatch = doc[field] === this.filter[field];
        const doesMatch = (entry || '') === this.filter[field];
        if (!didMatch && doesMatch) {
          const idx = this.items.indexOf(doc);
          if (idx === -1) {
            this.stats.hidden--;
            this.insertDoc(id, doc);
          }
        } else if (didMatch && !doesMatch) {
          // filter now fails
          const idx = this.items.indexOf(doc);
          if (idx !== -1) {
            this.stats.hidden++;
            this.items.splice(idx, 1);
          }
        }
      }

      // actually do the thing lol
      doc[field] = entry || '';
    }
  }

  onRemoved(path) {
    if (!path) {
      // root entry: ignore (TODO)
      return;
    }

    const parts = path.split('/');
    if (parts.length == 1) {
      // deleted document
      const [id] = parts;
      this.idMap.delete(id, doc);

      // remove doc from output
      const idx = this.items.indexOf(doc);
      if (idx !== -1) {
        this.items.splice(idx, 1);
      }

    } else if (parts.length == 2) {
      // remove field from existing doc
      const [id, field] = parts;
      const doc = this.idMap.get(id);
      doc[field] = null;

      // remove doc from output, if field is a filter
      if (field in this.filter) {
        const idx = this.items.indexOf(doc);
        if (idx !== -1) {
          this.stats.hidden++;
          this.items.splice(idx, 1);
        }
      }
    }
  }

  onReady() {
    console.log('Subscription is ready.', this.idMap);
    if (this.readyCbs) {
      this.readyCbs.resolve(this.items);
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