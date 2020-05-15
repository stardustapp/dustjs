const {Firestore} = require('firebase-admin').firestore;
// Firestore.FieldPath

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

class FirestoreCollection {
  constructor(collRef, tracker) {
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
    console.log('TODO: getall metrics');
    const result = await this._collRef.get();
    return result.docs.map(docSnap =>
      new FirestoreDocument(docSnap, this._tracker));
  }

  deleteAll() {
    this._tracker.collWipes.push(this);
  }
  async deleteAllInner() {
    const querySnap = await this._collRef.get();
    // Datadog.countFireOp('read', this.collRef, {fire_op: 'getall', method: 'collection/put'}, querySnap.size||1);
    // Datadog.countFireOp('write', this.collRef, {fire_op: 'delete', method: 'collection/put'}, querySnap.size);
    console.log('deleting', querySnap.size, 'entries from', this.collPath);
    for (const innerDoc of querySnap.docs) {
      await innerDoc.ref.delete();
    }
  }

  onSnapshot(snapCb, errorCb) {
    // Datadog.countFireOp('stream', this.collRef, {fire_op: 'onSnapshot', method: 'collection/subscribe'});
    return this._collRef.onSnapshot(querySnap => {
      // Datadog.countFireOp('read', this.collRef, {fire_op: 'watched', method: 'collection/subscribe'}, querySnap.docChanges().length);
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

class FirestoreDocument {
  constructor(docRefOrSnap, tracker, flags={}) {
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

  async getSnapshot() {
    if (!this._knownSnap) {
      if (!this._snapPromise) {
        this._snapPromise = this._docRef.get();
      }
      this._knownSnap = await this._snapPromise;
      this.hasSnap = true;
    }
    return this._knownSnap;
  }

  /*async*/ getData() {
    return this.getSnapshot()
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

  async getField(keyStack) {
    let data = await this.getData();
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

  onSnapshot(snapCb, errorCb) {
    // Datadog.countFireOp('stream', this.docRef, {fire_op: 'onSnapshot', method: 'doc/subscribe'});
    return this._docRef.onSnapshot(docSnap => {
      // Datadog.countFireOp('read', this.docRef, {fire_op: 'watched', method: 'doc/subscribe'});
      const doc = new FirestoreDocument(docSnap, null, this.flags);
      snapCb(doc);
    }, errorCb);
  }

  async commitChanges() {
    console.log('commiting changes', this.changes);
    // throw new Error(`TODO: Document commit`);

    const doc = {};
    const mergeFields = [];
    const cleared = [];
    const {encode} = require('querystring');

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

      switch (op) {
        case 'clear':
          if (!parentCleared) {
            cleared.push(encode(keyStack)+'&');
          }
          if (keyStack.length > 0) {
            top[keyStack.slice(-1)[0]] = null;
            if (!parentCleared) {
              mergeFields.push(new Firestore.FieldPath(...keyStack));
            }
          }
          break;
        case 'set':
          if (keyStack.length > 0) {
            top[keyStack.slice(-1)[0]] = value;
            if (!parentCleared) {
              mergeFields.push(new Firestore.FieldPath(...keyStack));
            }
          }
          break;
        default: throw new Error(
          `TODO: missing doc change op ${op}`);
      }
    }

    console.log({doc, mergeFields, cleared});
    if (cleared.join(',') === '&') {
      await this._docRef.set(doc);
    } else if (cleared.length > 0) {
      console.log("TODO");
      process.exit(0);
    } else {
      await this._docRef.set(doc, {
        mergeFields,
      });
    }
  }
}

class FirestoreDocumentLens {
  constructor(rootDoc, keyStack, flags={}) {
    this.rootDoc = rootDoc;
    this.keyStack = keyStack;
    this.flags = flags;
  }

  /*async*/ getData() {
    return this.rootDoc.getField(this.keyStack);
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

  // TODO: share snapshot stream w/ root document
  onSnapshot(snapCb, errorCb) {
    // Datadog.countFireOp('stream', this.docRef, {fire_op: 'onSnapshot', method: 'doc/subscribe'});
    return this.rootDoc._docRef.onSnapshot(docSnap => {
      // Datadog.countFireOp('read', this.docRef, {fire_op: 'watched', method: 'doc/subscribe'});
      const doc = new FirestoreDocument(docSnap, null, this.rootDoc.flags);
      const docLens = new FirestoreDocumentLens(doc, this.keyStack, this.flags);
      snapCb(docLens);
    }, errorCb);
  }
}

exports.ReferenceTracker = ReferenceTracker;
exports.FirestoreCollection = FirestoreCollection;
exports.FirestoreDocument = FirestoreDocument;
exports.FirestoreDocumentLens = FirestoreDocumentLens;
