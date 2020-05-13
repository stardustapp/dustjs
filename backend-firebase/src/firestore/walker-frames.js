const {FirestoreDocument} = require('./document.js');
const {parseDateStringOrThrow} = require('./util.js');
const {PathFragment} = require('@dustjs/skylink');

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

  // walkName(name) {
  //   console.log('walk to', name, 'from', this);
  //   throw new Error(`TODO walkName`)
  //   // return new BaseFrame(name);
  // }

  selectPath(path) {
    // console.log('selecting path', path, 'from', this);
    if (path.count() < 1) throw new Error(
      `BUG: selectPath wants a path`);
    const nextFrame = this.selectName(path.names[0]);
    if (nextFrame) {
      const remainingPath = path.slice(1);
      return { nextFrame, remainingPath };
    } else {
      return null;
    }
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
      return { Name: this.name, Type: 'String', StringValue: stringVal };
    }
  }

  async getStringValue() {
    const raw = await this.docLens.getData();
    if (raw == undefined) return null;
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
        return raw ? raw.toDate().toISOString() : null;
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
    if (nodeSpec.inner.family !== 'Primitive') throw new Error(
      `TODO: MapFrame only supports Primitive entries`);
    super(name, nodeSpec);
    this.docLens = docLens;
  }
  async getChildFrames() {
    const rawObj = await this.docLens.getData();
    if (!rawObj) return [];
    return Object.keys(rawObj).map(key => {
      const subLens = this.docLens.selectField([key]);
      return new PrimitiveFrame(key, this.nodeSpec.inner, subLens);
    });
  }
  selectName(key) {
    const subLens = this.docLens.selectField([key]);
    return new PrimitiveFrame(key, this.nodeSpec.inner, subLens);
  }
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
  async getLiteral() {
    const childFrames = await this.getChildFrames();
    return {
      Name: this.name,
      Type: 'Folder',
      Children: await Promise
        .all(childFrames
          .map(x => x
            .getLiteral())),
    };
  }
  selectName(name) {
    if (!indexRegex.test(name)) return;
    const index = parseInt(name) - 1;
    if (index < 0) return;

    const subLens = this.docLens.selectField([`${index}`]);
    return new PrimitiveFrame(name, this.nodeSpec.inner, subLens);
  }
  startSubscription(state, Depth) {
    return this.docLens.onSnapshot(async docSnap => {
      const frame = new ListFrame(this.name, this.nodeSpec, docSnap);
      const entry = await frame.getLiteral();
      if (entry) {
        state.offerPath('', entry);
      } else {
        state.removePath('');
      }
      state.markReady();
    }, error => {
      console.error('WARN: ListFrame#startSubscription snap error:',
          error.code, error.stack || error.message);
      state.markCrashed(error);
    });
  }
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
      Name: this.name,
      Type: 'Blob',
      MimeType: this.nodeSpec.mimeType,
      Data: data.toString('base64'),
    };
  }
}

const moment = require('moment');
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const indexRegex = /^\d+$/;
class PartitionedLogFrame extends NodeFrame {
  constructor(name, nodeSpec, refs) {
    if (nodeSpec.partitionBy !== 'Date') throw new Error(
      `TODO: PartitionedLogFrame only supports Date partitions`);

    super(name, nodeSpec);
    this.refs = refs; // horizon, latest, partitions
  }

  async getChildFrames() {
    const horizonStr = await this.refs.horizon.getData();
    const latestStr = await this.refs.latest.getData();
    if (!horizonStr || !latestStr) {
      return []; // TODO: better handling of empty logs?
    }

    const logHorizon = moment(horizonStr, 'YYYY-MM-DD');
    const logLatest = moment(latestStr, 'YYYY-MM-DD');
    const partitionFrames = [];
    for (let cursor = logHorizon; cursor <= logLatest; cursor.add(1, 'day')) {
      partitionFrames.push(this.selectPartition(cursor.format('YYYY-MM-DD')));
    }

    return [
      new PrimitiveFrame('horizon', {type: 'String'}, this.refs.horizon),
      new PrimitiveFrame('latest', {type: 'String'}, this.refs.latest),
      ...partitionFrames,
    ];
  }

  selectName(key) {
    switch (true) {
      case key === 'horizon' || key === 'latest':
        return new PrimitiveFrame(key, {type: 'String'}, this.refs[key]);
      case dateRegex.test(key):
        return this.selectPartition(key);
    }
  }

  selectPartition(dateStr) {
    const logDocRef = this.refs.partitions.doc(dateStr);
    const logDocLens = new FirestoreDocument(logDocRef);
    // TODO: this isn't not nodeSpec.inner - there's no AOF log node yet
    return new LogPartitionFrame(dateStr, this.nodeSpec, {
      horizon: logDocLens.selectField([`logHorizon`]),
      latest: logDocLens.selectField([`logLatest`]),
      entries: logDocRef.collection('entries'),
    });
  }
}

class LogPartitionFrame extends NodeFrame {
  constructor(name, nodeSpec, refs) {
    if (nodeSpec.innerMode !== 'AppendOnly') throw new Error(
      `LogPartitionFrame only supports AppendOnly logs`);

    super(name, nodeSpec);
    this.refs = refs; // horizon, latest, entries
  }

  async getChildFrames() {
    const logHorizon = await this.refs.horizon.getData();
    const logLatest = await this.refs.latest.getData();
    if (logHorizon == null || logLatest == null) {
      return []; // TODO: better handling of empty logs?
    }

    const entryFrames = [];
    for (let cursor = logHorizon; cursor <= logLatest; cursor++) {
      const entryId = `${cursor}`;
      const entryLens = new FirestoreDocument(this.refs.entries.doc(entryId));
      entryFrames.push(new DocumentFrame(entryId, this.nodeSpec.inner, entryLens));
    }

    return [
      new PrimitiveFrame('horizon', {type: 'Number'}, this.refs.horizon),
      new PrimitiveFrame('latest', {type: 'Number'}, this.refs.latest),
      ...entryFrames,
    ];
  }

  selectName(key) {
    switch (true) {
      case key === 'horizon' || key === 'latest':
        return new PrimitiveFrame(key, {type: 'Number'}, this.refs[key]);
      case indexRegex.test(key):
        const entryLens = new FirestoreDocument(this.refs.entries.doc(key));
        return new DocumentFrame(key, this.nodeSpec.inner, entryLens);
    }
  }
}

class DocumentFrame extends NodeFrame {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  getChildFrames() {
    const frames = new Array;
    // const compositeNames = new Map;
    for (const [subPath, subNode] of this.nodeSpec.fields) {
      frames.push(this.makeChildFrame(subPath, subNode));
    }
    return frames;
  }
  selectPath(path) {
    for (const [subPath, subNode] of this.nodeSpec.fields) {
      const subPathFrag = PathFragment.parse(subPath);
      if (path.startsWith(subPathFrag)) {
        return {
          nextFrame: this.makeChildFrame(subPath, subNode),
          remainingPath: path.slice(subPathFrag.count()),
        };
      }
    }
  }

  makeChildFrame(subPath, subNode) {
    const fieldStack = pathToFieldStack(subPath);
    const subName = decodeURIComponent(subPath.slice(1));

    if (subNode.family === 'Collection') {
      return new CollectionFrame(subName, subNode, this.docLens._docRef.collection(subName));
    } else if (subNode.family === 'PartitionedLog') {
      return this.makePartitionedLog(subPath, subNode);
    }

    const subLens = this.docLens.selectField(fieldStack);
    const frameConstr = {
      Primitive: PrimitiveFrame,
      Map: MapFrame,
      List: ListFrame,
      Blob: BlobFrame,
    }[subNode.family];
    if (!frameConstr) throw new Error(
      `TODO: DocumentFrame with field family ${subNode.family}`);

    return new frameConstr(subName, subNode, subLens);
  }

  makePartitionedLog(subPath, subNode) {
    const firestorePath = subNode.hints.firestorePath || subPath.slice(1);
    const logFieldStack = pathToFieldStack('/'+firestorePath);

    let logRootDocLens = this.docLens;
    let docRef = this.docLens._docRef;
    while (logFieldStack.length > 2) {
      const collName = logFieldStack.shift();
      const docId = logFieldStack.shift();
      // console.log(collName, docId, firestorePath, logFieldStack)
      docRef = docRef.collection(collName).doc(docId);
      logRootDocLens = new FirestoreDocument(docRef);
    }

    const lastLogField = logFieldStack.pop();
    if (lastLogField !== 'log') throw new Error(
      `TODO: logs must be called 'log' (${firestorePath})`);

    const subName = decodeURIComponent(subPath.slice(1));
    return new PartitionedLogFrame(subName, subNode, {
      horizon: logRootDocLens.selectField([...logFieldStack, `${lastLogField}Horizon`]),
      latest: logRootDocLens.selectField([...logFieldStack, `${lastLogField}Latest`]),
      partitions: docRef.collection('partitions'),
    });
  }

  async getLiteral() {
    const literal = {Name: this.name, Type: 'Folder', Children: []};
    const children = this.getChildFrames();
    for (const childFrame of children) {
      if (typeof childFrame.getLiteral === 'function') {
        const childLit = await childFrame.getLiteral();
        if (childLit) {
          literal.Children.push(childLit);
        }
      } else {
        console.log("Missing getLiteral() on", childFrame.constructor.name, "for", childFrame.name);
        literal.Children.push({Name: childFrame.name, Type: "Error", StringValue: "No getLiteral() implementation"});
      }
    }
    // console.log(literal);
    return literal;
  }

  startSubscription(state, Depth) {
    return this.docLens.onSnapshot(async docSnap => {
      const frame = new DocumentFrame(this.name, this.nodeSpec, docSnap);
      const entry = await frame.getLiteral();
      if (entry) {
        state.offerPath('', entry);
      } else {
        state.removePath('');
      }
      state.markReady();
    }, error => {
      console.error('WARN: DocumentFrame#startSubscription snap error:',
          error.code, error.stack || error.message);
      state.markCrashed(error);
    });
  }

}

class CollectionFrame extends NodeFrame {
  constructor(name, nodeSpec, collRef) {
    super(name, nodeSpec);
    this.collRef = collRef;
  }

  getLiteral() {
    return { Name: this.name, Type: 'Folder' };
  }

  async getChildFrames() {
    console.log('TODO: getall metrics');
    const result = await this.collRef.get();
    return result.docs.map(docSnap => {
      const document = new FirestoreDocument(docSnap.ref, docSnap);
      return new DocumentFrame(docSnap.id, this.nodeSpec.inner, document);
    });
  }

  selectName(name) {
    const document = new FirestoreDocument(this.collRef.doc(name));
    return new DocumentFrame(name, this.nodeSpec.inner, document);
  }

  startSubscription(state, Depth) {
    // Datadog.countFireOp('stream', this.collRef, {fire_op: 'onSnapshot', method: 'collection/subscribe'});
    return this.collRef.onSnapshot(async querySnap => {
      state.offerPath('', {Type: 'Folder'});

      // console.log('onSnapshot', querySnap.docChanges());
      // Datadog.countFireOp('read', this.collRef, {fire_op: 'watched', method: 'collection/subscribe'}, querySnap.docChanges().length);
      for (const docChange of querySnap.docChanges()) {
        switch (docChange.type) {
          case 'added':
          case 'modified':
            if (Depth > 1) {
              const frame = new DocumentFrame(docChange.doc.id, this.nodeSpec.inner, new FirestoreDocument(docChange.doc.ref, docChange.doc));
              const docLiteral = await frame.getLiteral();
              // console.log('doc literal', docLiteral);
              state.offerPath(docChange.doc.id, docLiteral);
            } else {
              state.offerPath(docChange.doc.id, {Type: 'Folder'});
            }
            break;
          case 'removed':
            state.removePath(docChange.doc.id);
            break;
          default:
            throw new Error(`weird docChange.type ${docChange.type}`);
        }
      }
      state.markReady();
    }, error => {
      console.error('WARN: CollectionFrame#startSubscription snap error:',
          error.code, error.stack || error.message);
      state.markCrashed(error);
    });
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
