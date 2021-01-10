const {PathFragment} = require('@dustjs/skylink');

const {CollectionFrame} = require('./frames/index.js');
const {FirestoreWalker} = require('./walker.js');
const {FirestoreCollection, ReferenceTracker} = require('./references.js');

class FirestoreCollectionDevice {
  constructor(collRef, rootDef, flags={}) {
    this.collRef = collRef;
    this.rootDef = rootDef;
    this.flags = flags;
  }

  getEntry(rawPath) {
    const path = PathFragment.parse(rawPath);

    const tracker = new ReferenceTracker();
    const collection = new FirestoreCollection(this.collRef, tracker, this.flags);
    const rootFrame = new CollectionFrame('collection', this.rootDef, collection);

    const regionWalker = new FirestoreWalker(tracker, rootFrame);
    if (regionWalker.walkPath(path)) {
      return regionWalker.getEntryApi();
    } else {
      return null;
    }
  }
}

exports.FirestoreCollectionDevice = FirestoreCollectionDevice;
