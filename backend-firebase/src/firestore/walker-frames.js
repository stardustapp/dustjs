
class BaseFrame {
  constructor(currRef) {
    this.currRef = currRef;
  }

  walkName(name) {
    console.log('walk to', name, 'from', this);
    throw new Error(`TODO walkName`)
  }
}

class NodeFrame extends BaseFrame {
  constructor(currRef, nodeSpec) {
    super(currRef);
    this.nodeSpec = nodeSpec;
  }
}

// class DocFieldFrame extends NodeFrame {
//   constructor(currRef, nodeSpec, keyStack, knownData=null) {
//     super(currRef, nodeSpec);
//     this.keyStack = keyStack;
//     this.knownData = knownData;
//   }
// }
//
// class DocSubPathFrame extends NodeFrame {
//   constructor(currRef, nodeSpec, keyStack, knownData=null) {
//     super(currRef, nodeSpec);
//     this.keyStack = keyStack;
//     this.knownData = knownData;
//   }
// }

class DocumentFrame extends NodeFrame {
  constructor(currRef, nodeSpec) {
    super(currRef, nodeSpec);
  }
  get treeName() {
    return this.currRef.baseName;
  }
  async getChildFrames() {
    console.log('TODO:', this.nodeSpec.fields);

    // const
    // for ()
  }
}

class CollectionFrame extends NodeFrame {
  constructor(currRef, nodeSpec) {
    super(currRef, nodeSpec);
  }
  async getChildFrames() {
    // console.log(this.nodeSpec.inner);
    console.log('TODO: getall metrics');
    const result = await this.currRef.get();
    return result.docs.map(docSnap => {
      const document = new FirestoreDocument(docSnap.ref, docSnap);
      return new DocumentFrame(document, this.nodeSpec.inner);
    })
    // console.log(result.docs);
    // return null;
  }
}

class RootFrame extends BaseFrame {
  constructor({
    rootRef,
    appId,
    regionId,
    rootPaths,
  }) {
    super(rootRef);
    this.appId = appId;
    this.regionId = regionId;
    this.rootPaths = rootPaths;
    // this.possiblePaths = new Map();
    // for (const [path, node] of rootPaths.entries().map())
  }

  selectPath(path) {
    const possibilities = new Array;
    for (const [nodePath, node] of this.rootPaths) {
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
        if (this.regionId == 'config') {
          rootRef = this.currRef
            .collection('config')
            .doc(this.appId);
        }
        break;
      case 'Collection':
        rootType = 'collection';
        if (this.regionId == 'persist') {
          rootRef = this.currRef
            .collection(`${this.appId} ${pathToField(`${nodePath}`)}`);
        } else {
          rootRef = this.currRef
            .collection('config')
            .doc(this.appId)
            .collection(pathToField(`${nodePath}`));
        }
        break;
      default: throw new Error(
        `Weird root type in ${this.appId} ${this.regionId} ${rootPath} ${rootDef.family}`);
    }
    if (!rootRef) throw new Error(
      `Failed to determine where to store ${this.appId} ${this.regionId} ${rootPath}`);

    if (rootDef.family === 'Collection') {
      return new CollectionFrame(rootRef, rootDef);
    } else {
      return new NodeFrame(rootRef, rootDef);
    }

    // console.log('setting up', {appId, region, rootPath}, 'with', rootRef.path);
    // this.env.bind(`/mnt/${region}/${appId}${rootPath}`, new FirestoreDataTreeDevice(rootDef, rootRef));
  }
}

module.exports = {
  BaseFrame,
  NodeFrame,
  CollectionFrame,
  RootFrame,
};
