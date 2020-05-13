class FirestoreDocument {
  constructor(docRef, knownSnap=null) {
    Object.defineProperties(this, {
      _docRef: {
        value: docRef,
        writable: false,
      },
      _knownSnap: {
        value: knownSnap,
        writable: true,
      },
    });

    this.docPath = docRef.path;
    if (knownSnap) {
      this.hasSnap = true;
    }
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

  selectField(keyStack) {
    if (keyStack.constructor !== Array) throw new Error(
      `selectField() needs an Array`);
    return new FirestoreDocumentLens(this, keyStack);
  }

  onSnapshot(snapCb, errorCb) {
    // Datadog.countFireOp('stream', this.docRef, {fire_op: 'onSnapshot', method: 'doc/subscribe'});
    return this._docRef.onSnapshot(docSnap => {
      // Datadog.countFireOp('read', this.docRef, {fire_op: 'watched', method: 'doc/subscribe'});
      const doc = new FirestoreDocument(this._docRef, docSnap);
      snapCb(doc);
    }, errorCb);
  }
}

class FirestoreDocumentLens {
  constructor(rootDoc, keyStack) {
    this.rootDoc = rootDoc;
    this.keyStack = keyStack;
  }

  /*async*/ getData() {
    return this.rootDoc.getField(this.keyStack);
  }

  selectField(furtherKeys) {
    if (furtherKeys.constructor !== Array) throw new Error(
      `selectField() needs an Array`);
    return new FirestoreDocumentLens(this.rootDoc, [
      ...this.keyStack,
      ...furtherKeys]);
  }

  // TODO: share snapshot stream w/ root document
  onSnapshot(snapCb, errorCb) {
    // Datadog.countFireOp('stream', this.docRef, {fire_op: 'onSnapshot', method: 'doc/subscribe'});
    return this.rootDoc._docRef.onSnapshot(docSnap => {
      // Datadog.countFireOp('read', this.docRef, {fire_op: 'watched', method: 'doc/subscribe'});
      const doc = new FirestoreDocument(docSnap.ref, docSnap);
      const docLens = new FirestoreDocumentLens(doc, this.keyStack);
      snapCb(docLens);
    }, errorCb);
  }
}

exports.FirestoreDocument = FirestoreDocument;
exports.FirestoreDocumentLens = FirestoreDocumentLens;
