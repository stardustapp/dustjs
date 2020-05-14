const {FirestoreDocument, FirestoreCollection} = require('../references.js');

const CollectionFrame = require('./CollectionFrame.js');
const DocumentFrame = require('./DocumentFrame.js');

function pathToField(path) {
  return path.slice(1)
    .replace(/-[a-z]/g, s=>s.slice(1).toUpperCase())
    .replace(/\//g, '.');
}

class RootFrame extends require('./BaseFrame.js') {
  constructor(config, subPath=null) {
    // TODO: the root should have a nodeSpec from the compiler
    super(subPath ? subPath.lastName() : config.appId, null);
    // console.log('root from', config)

    this.config = config;
    this.subPath = subPath;
    // this.rootRef = rootRef;
    // this.appId = appId;
    // this.regionId = regionId;
    // this.rootPaths = rootPaths;
  }

  async getChildFrames() {
    const rootFrames = new Map;
    const subFrames = new Array;
    for (const [nodePath, node] of this.config.rootPaths) {
      const firstName = decodeURIComponent(nodePath.parts[0]);
      if (nodePath.count() === 1) {
        subFrames.push(this.selectNode(nodePath, node));
      } else {
        throw new Error(`TODO: nested paths in root frame`)
        // if (!rootFrames.has(firstName))
      }
    }
    return subFrames;
  }

  selectPath(path) {
    // const fullPath = this.subPath ? this.subPath.

    const possibilities = new Array;
    for (const [nodePath, node] of this.config.rootPaths) {
      if (path.startsWith(nodePath)) {
        return {
          nextFrame: this.selectNode(nodePath, node),
          remainingPath: path.slice(nodePath.count()),
        };
      }
      else if (nodePath.startsWith(path)) {
        possibilities.push([nodePath, node]);
      }
    }
    console.log('possibilities:', possibilities);
    throw new Error(`TODO: possibilities frame`);

  }

  selectNode(nodePath, rootDef) {
    let rootType = null;
    let rootRef = null;
    switch (rootDef.family) {
      case 'Document':
        rootType = 'doc';
        if (this.config.regionId == 'config') {
          rootRef = this.config.rootRef
            .collection('config')
            .doc(this.config.appId);
        }
        break;
      case 'Collection':
        rootType = 'collection';
        if (this.config.regionId == 'persist') {
          rootRef = this.config.rootRef
            .collection(`${this.config.appId} ${pathToField(`${nodePath}`)}`);
        } else {
          rootRef = this.config.rootRef
            .collection('config')
            .doc(this.config.appId)
            .collection(pathToField(`${nodePath}`));
        }
        break;
      default: throw new Error(
        `Weird root type in ${this.config.appId} ${this.config.regionId} ${rootPath} ${rootDef.family}`);
    }
    if (!rootRef) throw new Error(
      `Failed to determine where to store ${this.config.appId} ${this.config.regionId} ${rootPath}`);

    if (rootDef.family === 'Collection') {
      const collection = new FirestoreCollection(rootRef);
      return new CollectionFrame(nodePath.lastName(), rootDef, collection);
    } else if (rootDef.family === 'Document') {
      const document = new FirestoreDocument(rootRef);
      return new DocumentFrame(nodePath.lastName(), rootDef, document);
    } else {
      throw new Error(`TODO: rootDef family ${rootDef.family}`);
      // return new BaseFrame(nodePath.lastName(), rootDef);
    }

    // console.log('setting up', {appId, region, rootPath}, 'with', rootRef.path);
    // this.env.bind(`/mnt/${region}/${appId}${rootPath}`, new FirestoreDataTreeDevice(rootDef, rootRef));
  }

}
module.exports = RootFrame;
