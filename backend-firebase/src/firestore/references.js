const {FieldPath, FieldValue} = require('firebase-admin').firestore;
const {encode} = require('querystring');

const {Datadog} = require('../lib/datadog.js');

const NewDocSymbol = Symbol.for('newDoc');

const IMMUTABLE_DOC_CACHE = new Map;
setInterval(() => {
  Datadog.gauge('firestore.cached_docs', IMMUTABLE_DOC_CACHE.size);
}, 20000).unref();

function slashEncode(str) {
  return str.replace(/[%/]/g, x => x === '%' ? '%25' : '%2F');
}
function slashDecode(str) {
  return str.replace(/%(2F|25)/g, x => x === '%25' ? '%' : '/');
}

class ReferenceTracker {
  constructor() {
    this.documents = new Array;
    this.collWipes = new Array;
  }

  async commitChanges() {
    for (const wipedColl of this.collWipes) {
      await wipedColl.deleteAllInner();
    }

    const changedDocs = this.documents
      .filter(x => x.changes.length > 0);

    console.log('commiting', changedDocs.length, 'changed docs to firestore');
    for (const doc of changedDocs) {
      await doc.commitChanges();
    }
  }
}

class FirestoreReference {
  tallyStream(fire_op, info={}, count=1) {
    Datadog.countFireOp('stream',
      this._collRef || this._docRef,
      {fire_op, ...info}, count);
  }
  tallyRead(fire_op, info={}, count=1) {
    Datadog.countFireOp('read',
      this._collRef || this._docRef,
      {fire_op, ...info}, count);
  }
  tallyWrite(fire_op, info={}, count=1) {
    Datadog.countFireOp('write',
      this._collRef || this._docRef,
      {fire_op, ...info}, count);
  }
}

class FirestoreCollection extends FirestoreReference {
  constructor(collRef, tracker, flags={}) {
    super();
    Object.defineProperties(this, {
      _collRef: {
        value: collRef,
        writable: false,
      },
      _tracker: {
        value: tracker,
        writable: false,
      },
    });

    this.collPath = collRef.path;

    // Some flags don't inherit
    const {defaultQuery, ...regFlags} = flags;
    this.defaultQuery = defaultQuery;
    this.flags = regFlags;
  }
  selectDocument(id, flags={}) {
    if (id === NewDocSymbol) {
      if (this.flags.readOnly) throw new Error(
        `Cannot create new doc within readonly collection`);
      return new FirestoreDocument(this._collRef.doc(), this._tracker, {
        newDoc: true,
        ...this.flags,
        ...flags});
    } else {
      return new FirestoreDocument(this._collRef.doc(slashEncode(id)), this._tracker, {
        ...this.flags,
        ...flags,
      });
    }
  }

  buildQueryCursor({filter, orderBy, limit, startAfter}) {
    let cursor = this._collRef;
    if (filter) cursor = cursor.where(filter.field, filter.operation, filter.value);
    if (orderBy) cursor = cursor.orderBy(orderBy.field, orderBy.direction);
    if (limit) cursor = cursor.limit(limit);
    if (startAfter) cursor = cursor.startAfter(startAfter);
    return cursor;
  }
  getDefaultCursor() {
    if (this.defaultQuery) {
      return this.buildQueryCursor(this.defaultQuery);
    }
    return this._collRef;
  }

  async getAllSnapshots() {
    const result = await this.getDefaultCursor().get();
    this.tallyRead('getall', {method: 'collection/get'}, result.size||1);

    return result.docs.map(docSnap =>
      new FirestoreDocument(docSnap, this._tracker, this.flags));
  }

  async getSomeSnapshots(query) {
    const cursor = this.buildQueryCursor(query);
    const result = await cursor.get();
    this.tallyRead('getsome', {method: 'collection/get'}, result.size||1);
    return result.docs.map(docSnap =>
      new FirestoreDocument(docSnap, this._tracker, this.flags));
  }

  deleteAll() {
    if (this.flags.readOnly) throw new Error(
      `Cannot deleteAll from a readonly collection`);
    this._tracker.collWipes.push(this);
  }
  async deleteAllInner() {
    // TODO: is it ok that this ignores defaultQuery?
    const querySnap = await this._collRef.get();
    this.tallyRead('getall', {method: 'collection/clear'}, querySnap.size||1);
    this.tallyWrite('delete', {method: 'collection/clear'}, querySnap.size);

    console.log('deleting', querySnap.size, 'entries from', this.collPath);
    for (const innerDoc of querySnap.docs) {
      await innerDoc.ref.delete();
    }
  }

  onSnapshot(snapCb, errorCb, logMethod=null) {
    this.tallyStream('onSnapshot', {method: logMethod||'collection/unknown'});
    return this.getDefaultCursor().onSnapshot(querySnap => {
      this.tallyRead('watched', {method: logMethod||'collection/unknown'}, querySnap.docChanges().length);

      snapCb({
        docChanges: () => {
          return querySnap.docChanges().map(change => ({
            type: change.type,
            doc: new FirestoreDocument(change.doc, null, this.flags),
          }));
        },
      });
    }, errorCb);
  }
}

class FirestoreDocument extends FirestoreReference {
  constructor(docRefOrSnap, tracker, flags={}) {
    super();
    Object.defineProperties(this, {
      _docRef: {
        value: ('ref' in docRefOrSnap) ? docRefOrSnap.ref : docRefOrSnap,
        writable: false,
      },
      _knownSnap: {
        value: ('ref' in docRefOrSnap) ? docRefOrSnap : null,
        writable: true,
      },
      _snapPromise: {
        value: null,
        writable: true,
      },
      _tracker: {
        value: tracker,
        writable: false,
      },
    });

    if (tracker) {
      tracker.documents.push(this);
      this.changes = new Array;
    }

    this.docPath = this._docRef.path;
    if (this._knownSnap) {
      this.hasSnap = true;
    }

    this.flags = flags;
  }
  get id() {
    return slashDecode(this._docRef.id);
  }
  selectCollection(id) {
    return new FirestoreCollection(this._docRef.collection(slashEncode(id)), this._tracker);
  }

  async getSnapshot(logMethod=null) {
    if (!this._knownSnap) {
      if (!this._snapPromise) {
        // from here we want to report a load, even if it's cached
        // console.log('get snap', logMethod, this.flags, this._docRef.path);
        let cache = 'none';
        if (this.flags.immutable) {
          this._knownSnap = IMMUTABLE_DOC_CACHE.get(this._docRef.path);
          cache = this._knownSnap ? 'hit' : 'miss';
        }

        this.tallyRead('get', {cache, method: logMethod || 'unknown'});
        if (this._knownSnap) {
          return this._knownSnap;
        }
        this._snapPromise = this._docRef.get();

        if (this.flags.immutable) {
          this._snapPromise.then(doc => IMMUTABLE_DOC_CACHE.set(this._docRef.path, doc));
        }
      }
      this._knownSnap = await this._snapPromise;
      this.hasSnap = true;
    }
    return this._knownSnap;
  }

  /*async*/ getData(logMethod) {
    return this.getSnapshot(logMethod)
      .then(x => x.data());
  }

  removeData() {
    if (this.flags.readOnly) throw new Error(
      `This field is readonly`);
    this.changes.push([[], 'remove']);
  }
  clearData() {
    if (this.flags.readOnly) throw new Error(
      `This field is readonly`);
    this.changes.push([[], 'clear']);
  }
  // setData(raw) {
  //   if (this.flags.readOnly) throw new Error(
  //     `This field is readonly`);
  //   this.changes.push([[], 'set', raw]);
  // }

  async getField(keyStack, logMethod) {
    let data = await this.getData(logMethod);
    for (const key of keyStack) {
      if (!data || ![Object, Array].includes(data.constructor)) {
        console.log(`getField${JSON.stringify(keyStack)} missed`);
        return null;
      }
      data = data[key];
    }
    return data;
  }

  selectField(keyStack, flags={}) {
    if (keyStack.constructor !== Array) throw new Error(
      `selectField() needs an Array`);
    return new FirestoreDocumentLens(this, keyStack, {...this.flags, ...flags});
  }

  // TODO: dedupe snapshot stream if there's multiple on one path
  onSnapshot(snapCb, errorCb, logMethod=null) {
    this.tallyStream('onSnapshot', {method: logMethod||'doc/unknown'});
    return this._docRef.onSnapshot(docSnap => {
      this.tallyRead('watched', {method: logMethod||'doc/unknown'});
      snapCb(new FirestoreDocument(docSnap, null, this.flags));
    }, errorCb);
  }

  async commitChanges() {
    // console.log('commiting changes', this.changes);
    // throw new Error(`TODO: Document commit`);

    const doc = {};
    const mergeFields = [];
    const cleared = [];
    const removed = [];

    for (let [keyStack, op, value] of this.changes) {

      let top = doc;
      let parentCleared = cleared.includes('&');
      let miniStack = [];
      for (const name of keyStack.slice(0, -1)) {
        if (typeof name === 'number' && top.constructor !== Array) {
          throw new Error(`TODO: storing array indices`);
        }
        top = top[name] = top[name] || {};
        miniStack.push(name);
        const prefix = encode(miniStack)+'&';
        if (removed.includes(prefix)) {
          throw new Error(`BUG: tried setting underneath a remove`);
        } else if (cleared.includes(prefix)) {
          parentCleared = true;
        }
      }

      if (!parentCleared) {
        cleared.push(encode(keyStack)+'&');
      }

      if (keyStack.length > 0) {
        switch (op) {
          case 'remove':
            if (!parentCleared) {
              top[keyStack.slice(-1)[0]] = FieldValue.delete();
              removed.push(encode(keyStack)+'&');
            }
            break;
          case 'clear':
            top[keyStack.slice(-1)[0]] = null;
            break;
          case 'set':
            top[keyStack.slice(-1)[0]] = value;
            break;
          default: throw new Error(
            `TODO: missing doc change op ${op}`);
        }
        if (!parentCleared) {
          mergeFields.push(new FieldPath(...keyStack));
        }
      } else if (op === 'remove') {
        removed.push(encode(keyStack)+'&');
      }
    }

    // console.log({doc, mergeFields, removed, cleared});

    if (this.flags.newDoc) {
      if (removed.join(',') === '&') throw new Error(
        `BUG: Tried deleting a newDoc, what?`);

      // the doc ID is assigned by #add()
      // const newRef = await this._docRef.parent.add(doc);
      await this._docRef.set(doc);
      this.tallyWrite('add', {method: 'document/commit'});

      // const {newDoc, ...newFlags} = this.flags;
      // return new FirestoreDocument({
      //   ref: newRef,
      //   data() { return doc; },
      // }, this._tracker, newFlags);

    } else if (removed.join(',') === '&') {
      await this._docRef.delete();
      this.tallyWrite('delete', {method: 'document/commit'});
    } else if (cleared.join(',') === '&') {
      await this._docRef.set(doc);
      if (this.flags.immutable) {
        IMMUTABLE_DOC_CACHE.set(this._docRef.path, {
          id: this._docRef.id,
          path: this._docRef.path,
          data() { return doc; },
        });
      }
      this.tallyWrite('set', {method: 'document/commit'});
    } else if (this.flags.immutable) {
      // todo: also protect against replacements, not just merges
      throw new Error(`This document is immutable, so it cannot be changed.`);
    } else {
      await this._docRef.set(doc, {
        mergeFields,
      });
      this.tallyWrite('merge', {method: 'document/commit'});
    }
  }
}

class FirestoreDocumentLens {
  constructor(rootDoc, keyStack, flags={}) {
    this.rootDoc = rootDoc;
    this.keyStack = keyStack;
    this.flags = flags;
  }

  selectField(furtherKeys, flags={}) {
    if (furtherKeys.constructor !== Array) throw new Error(
      `selectField() needs an Array`);
    return new FirestoreDocumentLens(this.rootDoc, [
      ...this.keyStack,
      ...furtherKeys,
    ], {
      ...this.flags,
      ...flags,
    });
  }

  /*async*/ getData(logMethod) {
    return this.rootDoc.getField(this.keyStack, logMethod);
  }

  removeData() {
    if (!this.isWritable) throw new Error(
      `This field is readonly`);
    this.rootDoc.changes.push([this.keyStack, 'remove']);
  }
  clearData() {
    if (!this.isWritable) throw new Error(
      `This field is readonly`);
    this.rootDoc.changes.push([this.keyStack, 'clear']);
  }
  setData(raw) {
    if (!this.isWritable) throw new Error(
      `This field is readonly`);
    this.rootDoc.changes.push([this.keyStack, 'set', raw]);
  }

  get isWritable() {
    if (!this.flags.readOnly) return true;
    if (!this.flags.readOnlyExceptions) return false;
    if (this.flags.readOnlyExceptions.includes(this.keyStack.join('.'))) return true;
    return false;
  }

  onSnapshot(snapCb, errorCb, logMethod=null) {
    return this.rootDoc.onSnapshot(rootLens => {
      snapCb(new FirestoreDocumentLens(rootLens, this.keyStack, this.flags));
    }, errorCb, logMethod || 'field/subscribe');
  }
}

module.exports = {
  ReferenceTracker,
  FirestoreReference,
  FirestoreCollection,
  FirestoreDocument,
  FirestoreDocumentLens,
};
