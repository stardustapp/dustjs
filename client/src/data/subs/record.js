// Supports 2-deep subscriptions of format:
// /:id - a document with unique/arbitrary id
// /:id/:field - string fields of document
// documents are presented as vanilla objects
export class RecordSubscription {
  constructor(sub, opts) {
    this.sub = sub;
    this.basePath = opts.basePath;
    this.fields = opts.fields || [];
    this.selfItems = this.fields.join(',') == '@';
    this.filter = opts.filter || {};
    this.orderBy = opts.orderBy || false;
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
    }, this.onError.bind(this));
  }

  stop() {
    return this.sub.stop();
  }

  compareDocs(x, y) {
    // TODO: proper parsing etc.
    if (this.orderBy === '-origin.date') {
      const a = x.origin.date;
      const b = y.origin.date;
      return a > b;
    }
    return x._id < y._id;
  }

  insertDoc(doc) {
    const properIdx = this.items.findIndex(this.compareDocs.bind(this, doc));
    window.rec=this;
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
    // console.log(parts.length, parts, entry)
    if (parts.length == 1) {
      // new document
      const [id] = parts;
      const doc = {
        _id: decodeURIComponent(id),
        _path: this.basePath + '/' + id,
        ...entry, // TODO: better description of bulk adding folders
      };
      if (this.selfItems) {
        doc.value = entry;
      } else if (this.fields.length) {
        this.fields.forEach(x => doc[x] = null);
      }

      // store it
      this.idMap.set(id, doc);
      if (Object.keys(this.filter).length == 0 && !this.orderBy) {
        this.insertDoc(doc);
      } else {
        this.stats.hidden++;
      }

    } else if (parts.length >= 2) {
      // add field to existing doc
      const [id, ...fieldPath] = parts;
      const fieldStr = fieldPath.join('.');
      const field = fieldPath.pop();
      const doc = this.idMap.get(id);

      let handle = doc;
      for (const key of fieldPath)
        handle = handle[key] || {};

      if (globalThis.Vue) {
        globalThis.Vue.set(handle, field, entry || '');
      } else {
        handle[field] = entry || '';
      }

      let shouldExist = true;

      // check filter
      if (fieldStr in this.filter) {
        if (handle[field] === this.filter[fieldStr]) {
          shouldExist = false;
        }
      }

      // check sort field
      // TODO
      if (this.orderBy === '-origin.date') {
        if (!doc.origin || !doc.origin.date) {
          shouldExist = false;
          // TODO: respect orderBy field as well = false;
        }
      }

      if (shouldExist) {
        const idx = this.items.indexOf(doc);
        if (idx === -1) {
          this.stats.hidden--;
          this.insertDoc(doc);
        }
      } else {
        const idx = this.items.indexOf(doc);
        if (idx !== -1) {
          this.stats.hidden++;
          this.items.splice(idx, 1);
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
      if (this.selfItems) {
        const [id] = parts;
        const doc = this.idMap.get(id);
        doc.value = entry;
      } else if (this.fields.length) {
        console.warn('recordsub got changed packet for entire document. not implemented!', path, entry);
      }

    } else if (parts.length >= 2) {
      // changed field on existing doc
      const [id, ...fieldPath] = parts;
      const fieldStr = fieldPath.join('.');
      const field = fieldPath.pop();
      const doc = this.idMap.get(id);

      let handle = doc;
      for (const key of fieldPath)
        handle = handle[key] || {};

      // check filter
      if (fieldStr in this.filter) {
        const didMatch = handle[field] === this.filter[fieldStr];
        const doesMatch = (entry || '') === this.filter[fieldStr];
        if (!didMatch && doesMatch) {
          const idx = this.items.indexOf(doc);
          if (idx === -1) {
            this.stats.hidden--;
            this.insertDoc(doc);
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
      handle[field] = entry || '';

      // TODO: resort items if this was an orderBy field
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
      const doc = this.idMap.get(id);
      this.idMap.delete(id);

      // remove doc from output
      const idx = this.items.indexOf(doc);
      if (idx !== -1) {
        this.items.splice(idx, 1);
      }

    } else if (parts.length >= 2) {
      // remove field from existing doc
      const [id, ...fieldPath] = parts;
      const fieldStr = fieldPath.join('.');
      const field = fieldPath.pop();
      const doc = this.idMap.get(id);

      if (!doc) {
        // server inefficiency; deletion a name deletes everything below
        console.warn('ignored field deletion for nonexistant document');
        return;
      }

      let handle = doc;
      for (const key of fieldPath)
        handle = handle[key] || {};

      handle[field] = null;

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
