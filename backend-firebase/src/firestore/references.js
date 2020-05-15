const {Firestore} = require('firebase-admin').firestore;
const {encode} = require('querystring');

const {Datadog} = require('../lib/datadog.js');

class ReferenceTracker {
  constructor() {
    this.documents = new Array;
    this.collWipes = new Array;
  }

  async commitChanges() {
    for (const wipedColl of this.collWipes) {
      await wipedColl.deleteAllInner();
    }

    const changedDocs = this.documents.filter(x => x.changes.length > 0);

    console.log('commiting', changedDocs.length, 'changed docs to firestore');
    for (const doc of changedDocs) {
      // console.log(doc);
      await doc.commitChanges();
    }
    console.log();
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
  constructor(collRef, tracker) {
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
  }
  selectDocument(id) {
    return new FirestoreDocument(this._collRef.doc(id), this._tracker);
  }

  async getAllSnapshots() {
    const result = await this._collRef.get();
    this.tallyRead('getall', {method: 'collection/get'}, result.size||1);

    return result.docs.map(docSnap =>
      new FirestoreDocument(docSnap, this._tracker));
  }

  deleteAll() {
    this._tracker.collWipes.push(this);
  }
  async deleteAllInner() {
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
    return this._collRef.onSnapshot(querySnap => {
      this.tallyRead('watched', {method: logMethod||'collection/unknown'}, querySnap.docChanges().length);

      snapCb({
        docChanges: () => {
          return querySnap.docChanges().map(change => ({
            type: change.type,
            doc: new FirestoreDocument(change.doc, null),
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
    // TODO: escaping?
    return this._docRef.id;
  }
  selectCollection(id) {
    return new FirestoreCollection(this._docRef.collection(id), this._tracker);
  }

  async getSnapshot(logMethod=null) {
    if (!this._knownSnap) {
      if (!this._snapPromise) {
        this.tallyRead('get', {method: logMethod || 'unknown'});
        this._snapPromise = this._docRef.get();
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
    console.log('commiting changes', this.changes);
    // throw new Error(`TODO: Document commit`);

    const doc = {};
    const mergeFields = [];
    const cleared = [];

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
        if (cleared.includes(prefix)) {
          parentCleared = true;
        }
      }

      if (!parentCleared) {
        cleared.push(encode(keyStack)+'&');
      }

      if (keyStack.length > 0) {
        switch (op) {
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
          mergeFields.push(new Firestore.FieldPath(...keyStack));
        }
      }
    }

    console.log({doc, mergeFields, cleared});
    if (cleared.join(',') === '&') {
      await this._docRef.set(doc);
      this.tallyWrite('set', {method: 'document/commit'});
    // } else if (cleared.length > 0) {
    //   console.log("TODO");
    //   process.exit(10);
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

  clearData() {
    if (this.flags.readOnly) throw new Error(
      `This field is readonly`);
    this.rootDoc.changes.push([this.keyStack, 'clear']);
  }
  setData(raw) {
    if (this.flags.readOnly) throw new Error(
      `This field is readonly`);
    this.rootDoc.changes.push([this.keyStack, 'set', raw]);
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
