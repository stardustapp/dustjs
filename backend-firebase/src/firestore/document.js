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
  }

  async getSnapshot() {
    if (!this._knownSnap) {
      this._knownSnap = await this._docRef.get();
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
      if (!data || data.constructor !== Object) throw new Error(
        `Document#getField(${JSON.stringify(keyStack)}) missed`);
      data = data[key];
    }
    return data;
  }

  selectField(keyStack) {
    return new FirestoreDocumentLens(this, keyStack);
  }
}

class FirestoreDocumentLens {
  constructor(rootDoc, keyStack) {
    this.rootDoc = rootDoc;
    this.keyStack = keyStack;
  }

  selectField(furtherKeys) {
    return new FirestoreDocumentLens(this.rootDoc, [
      ...this.keyStack,
      ...furtherKeys]);
  }
}

exports.FirestoreDocument = FirestoreDocument;
exports.FirestoreDocumentLens = FirestoreDocumentLens;
