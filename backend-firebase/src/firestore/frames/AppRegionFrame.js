const {FirestoreDocument, FirestoreCollection} = require('../references.js');

const CollectionFrame = require('./CollectionFrame.js');
const DocumentFrame = require('./DocumentFrame.js');

function pathToField(path) {
  return path.slice(1)
    .replace(/-[a-z]/g, s=>s.slice(1).toUpperCase())
    .replace(/\//g, '.');
}

class AppRegionFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, rootConfig) {
    super(name, nodeSpec);
    this.rootConfig = rootConfig;
  }

  getChildFrames() {
    const frames = new Array;
    for (const [name, spec] of this.nodeSpec.names) {
      frames.push(this.makeChildFrame(name, spec));
    }
    return frames;
  }

  selectName(name) {
    const childSpec = this.nodeSpec.names.get(name);
    if (childSpec) {
      return this.makeChildFrame(name, childSpec);
    }
  }

  makeChildFrame(nodeName, rootDef) {
    const fullPath = [
      this.rootConfig.subPath ? this.rootConfig.subPath : '',
      encodeURIComponent(nodeName),
    ].join('/');

    let rootType = null;
    let rootRef = null;
    switch (rootDef.family) {
      case 'Folder':
        return new AppRegionFrame(nodeName, rootDef, {
          ...this.rootConfig,
          subPath: fullPath,
        });
      case 'Document':
        rootType = 'doc';
        if (this.rootConfig.regionId == 'config') {
          rootRef = this.rootConfig.rootRef
            .collection('config')
            .doc(this.rootConfig.appId);
        }
        break;
      case 'Collection':
        rootType = 'collection';
        if (this.rootConfig.regionId == 'persist') {
          rootRef = this.rootConfig.rootRef
            .collection(`${this.rootConfig.appId} ${pathToField(`${fullPath}`)}`);
        } else {
          rootRef = this.rootConfig.rootRef
            .collection('config')
            .doc(this.rootConfig.appId)
            .collection(pathToField(`${fullPath}`));
        }
        break;
      default: throw new Error(
        `Weird root type in ${this.rootConfig.appId} ${this.rootConfig.regionId} ${fullPath} ${rootDef.family}`);
    }
    if (!rootRef) throw new Error(
      `Failed to determine where to store ${this.rootConfig.appId} ${this.rootConfig.regionId} ${fullPath}`);

    if (rootDef.family === 'Collection') {
      const collection = new FirestoreCollection(rootRef, this.rootConfig.tracker);
      return new CollectionFrame(nodeName, rootDef, collection);
    } else if (rootDef.family === 'Document') {
      const document = new FirestoreDocument(rootRef, this.rootConfig.tracker);
      return new DocumentFrame(nodeName, rootDef, document);
    } else {
      throw new Error(`TODO: rootDef family ${rootDef.family}`);
      // return new BaseFrame(nodePath.lastName(), rootDef);
    }
  }

}
module.exports = AppRegionFrame;
