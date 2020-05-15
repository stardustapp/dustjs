const {PathFragment} = require('@dustjs/skylink');

const CollectionFrame = require('./CollectionFrame.js');
const PartitionedLogFrame = require('./PartitionedLogFrame.js');
const {constructFrame} = require('./_factory.js');

function pathToFieldStack(path) {
  return path.slice(1).split('\/').map(x => x
    .replace(/-[a-z]/g, s=>s.slice(1).toUpperCase()));
}

class DocumentFrame extends require('./BaseFrame.js') {
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
    return {};
  }

  makeChildFrame(subPath, subNode) {
    const fieldStack = pathToFieldStack(subPath);
    const subName = decodeURIComponent(subPath.slice(1));

    if (subNode.family === 'Collection') {
      return new CollectionFrame(subName, subNode, this.docLens.selectCollection(subName));
    } else if (subNode.family === 'PartitionedLog') {
      return this.makePartitionedLog(subPath, subNode);
    }

    const subLens = this.docLens.selectField(fieldStack);
    return constructFrame(subName, subNode, subLens);
  }

  makePartitionedLog(subPath, subNode) {
    const firestorePath = subNode.hints.firestorePath || subPath.slice(1);
    const logFieldStack = pathToFieldStack('/'+firestorePath);

    let logRootDocLens = this.docLens;
    while (logFieldStack.length > 2) {
      const collName = logFieldStack.shift();
      const docId = logFieldStack.shift();
      // console.log(collName, docId, firestorePath, logFieldStack)
      logRootDocLens = logRootDocLens
        .selectCollection(collName)
        .selectDocument(docId);
    }

    const lastLogField = logFieldStack.pop();
    if (lastLogField !== 'log') throw new Error(
      `TODO: logs must be called 'log' (${firestorePath})`);

    const subName = decodeURIComponent(subPath.slice(1));
    return new PartitionedLogFrame(subName, subNode, {
      horizon: logRootDocLens.selectField([...logFieldStack, `${lastLogField}Horizon`]),
      latest: logRootDocLens.selectField([...logFieldStack, `${lastLogField}Latest`]),
      partitions: logRootDocLens.selectCollection('partitions'),
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

  putLiteral(input) {
    if (!input) {
      this.docLens.clearData();
      return;
    }
    if (input.Type !== 'Folder') throw new Error(
      `Documents must be stored as Folder entries`);

    // root-puts act as a full replacement
    this.docLens.clearData();
    const children = new Map(input.Children.map(x => [x.Name, x]));
    for (const frame of this.getChildFrames()) {
      if (children.has(frame.name)) {
        if (typeof frame.putLiteral === 'function') {
          frame.putLiteral(children.get(frame.name));
        } else throw new Error(
          `TODO: ${frame.constructor.name} lacks putLiteral()`);
      }
    }
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
module.exports = DocumentFrame;
