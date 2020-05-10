const {FirestoreDocument} = require('./document.js');
const {parseDateStringOrThrow} = require('./util.js');

function pathToField(path) {
  return path.slice(1)
    .replace(/-[a-z]/g, s=>s.slice(1).toUpperCase())
    .replace(/\//g, '.');
}

function pathToFieldStack(path) {
  return path.slice(1).split('\/').map(x => x
    .replace(/-[a-z]/g, s=>s.slice(1).toUpperCase()));
}

// function fieldToTreeName(field) {
//   return field.replace(/[A-Z]/g, s=>'-'+s.toLowerCase());
// }

class BaseFrame {
  constructor(name) {
    this.name = name;
  }

  walkName(name) {
    console.log('walk to', name, 'from', this);
    throw new Error(`TODO walkName`)
    // return new BaseFrame(name);
  }
}

class NodeFrame extends BaseFrame {
  constructor(name, nodeSpec) {
    super(name);
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

class PrimitiveFrame extends NodeFrame {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  async getLiteral() {
    const stringVal = await this.getStringValue();
    if (stringVal === null) {
      return null;
    } else {
      return { Type: 'String', StringValue: stringVal };
    }
  }

  async getStringValue() {
    const raw = await this.docLens.getData();
    if (raw === undefined) return null;
    switch (this.nodeSpec.type) {

      case 'String':
        return `${raw}`;
      //         fromStringValue(val) {
      //           return val || '';

      case 'Boolean':
        return raw ? 'yes' : 'no';
      //         fromStringValue(val) {
      //           return val === 'yes';

      case 'Number':
        return `${raw || 0}`;
      //         fromStringValue(val) {
      //           return parseFloat(val);

      case 'Date':
        return raw ? raw.toISOString() : null;
      //         fromStringValue(val) {
      //           return val ? parseDateStringOrThrow(val) : null;

      default:
        console.log('i have data', raw, this.nodeSpec);
        throw new Error(`TODO: unmapped DataTree field`);
    }
  }
}

class MapFrame extends NodeFrame {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }
  async getChildFrames() {
    console.log(await this.docLens.getData())
    throw new Error('TODO')
  }
  // TODOODODODODOOTODOD
}

class ListFrame extends NodeFrame {
  constructor(name, nodeSpec, docLens) {
    if (nodeSpec.inner.family !== 'Primitive') throw new Error(
      `ListFrame only supports Primitive entries`);

    super(name, nodeSpec);
    this.docLens = docLens;
  }
  async getChildFrames() {
    const data = await this.docLens.getData();
    return data.map((val, idx) => {
      const subLens = this.docLens.selectField([`${idx}`]);
      return new PrimitiveFrame(`${idx+1}`, this.nodeSpec.inner, subLens);
    });
  }
  // TODOODODODODOOTODOD
}

class BlobFrame extends NodeFrame {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  async getLiteral() {
    let data = await this.docLens.getData();
    if (data == null) {
      return null;
    }

    if (typeof data === 'string') {
      data = Buffer.from(data, 'utf-8');
    } else if (data.constructor !== Buffer) throw new Error(
      `BUG: Blob from store was type ${data.constructor.name}`);

    return {
      Type: 'Blob',
      MimeType: this.nodeSpec.mimeType,
      Data: data.toString('base64'),
    };
  }
}

class DocumentFrame extends NodeFrame {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  async getChildFrames() {
    // console.log('TODO:', this.nodeSpec.fields, this.docLens);

    const frames = new Array;
    // const compositeNames = new Map;
    for (const [subPath, subNode] of this.nodeSpec.fields) {

      const fieldStack = pathToFieldStack(subPath);
      const subLens = this.docLens.selectField(fieldStack);
      const subName = decodeURIComponent(subPath.slice(1));

      const frameConstr = {
        Primitive: PrimitiveFrame,
        Map: MapFrame,
        List: ListFrame,
        Blob: BlobFrame,
      }[subNode.family];
      if (!frameConstr) throw new Error(
        `TODO: DocumentFrame with field family ${subNode.family}`);

      frames.push(new frameConstr(subName, subNode, subLens));
    }

    return frames;
  }
  selectPath(path) {
    for (const [subPath, subNode] of this.nodeSpec.fields) {
      if (path.equals(subPath)) {
        const fieldStack = pathToFieldStack(subPath);
        const subLens = this.docLens.selectField(fieldStack);
        const subName = decodeURIComponent(subPath.slice(1));

        const frameConstr = {
          Primitive: PrimitiveFrame,
          Map: MapFrame,
          List: ListFrame,
          Blob: BlobFrame,
        }[subNode.family];
        if (!frameConstr) throw new Error(
          `TODO: DocumentFrame with field family ${subNode.family}`);

        return {
          nextFrame: new frameConstr(subName, subNode, subLens),
          remainingPath: path.slice(1000),
        };
      }
    }
  }
}

class CollectionFrame extends NodeFrame {
  constructor(name, nodeSpec, collRef) {
    super(name, nodeSpec);
    this.collRef = collRef;
  }

  async getChildFrames() {
    // console.log(this.nodeSpec.inner);
    console.log('TODO: getall metrics');
    const result = await this.collRef.get();
    return result.docs.map(docSnap => {
      const document = new FirestoreDocument(docSnap.ref, docSnap);
      return new DocumentFrame(docSnap.id, this.nodeSpec.inner, document);
    });
    // console.log(result.docs);
    // return null;
  }

  selectPath(path) {
    const firstName = decodeURIComponent(path.parts[0]);
    const document = new FirestoreDocument(this.collRef.doc(firstName));
    return {
      nextFrame: new DocumentFrame(firstName, this.nodeSpec.inner, document),
      remainingPath: path.slice(1),
    };
  }

}

class RootFrame extends BaseFrame {
  constructor(config, subPath=null) {
    super(subPath ? subPath.lastName() : config.appId);
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
      return new CollectionFrame(nodePath.lastName(), rootDef, rootRef);
    } else if (rootDef.family === 'Document') {
      const document = new FirestoreDocument(rootRef);
      return new DocumentFrame(nodePath.lastName(), rootDef, document);
    } else {
      throw new Error(`TODO: rootDef family ${rootDef.family}`);
      return new NodeFrame(nodePath.lastName(), rootDef, rootRef);
    }

    // console.log('setting up', {appId, region, rootPath}, 'with', rootRef.path);
    // this.env.bind(`/mnt/${region}/${appId}${rootPath}`, new FirestoreDataTreeDevice(rootDef, rootRef));
  }
}

module.exports = {
  BaseFrame,
  NodeFrame,
  DocumentFrame,
  CollectionFrame,
  RootFrame,
};
