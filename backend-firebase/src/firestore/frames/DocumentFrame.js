const {PathFragment} = require('@dustjs/skylink');

const CollectionFrame = require('./CollectionFrame.js');
const PartitionedLogFrame = require('./PartitionedLogFrame.js');
const {constructFrame} = require('./_factory.js');

function nameToField(name) {
  return name
    .replace(/-[a-z]/g, s => s
      .slice(1)
      .toUpperCase());
}

class DocumentFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
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

  makeChildFrame(subName, subNode) {
    switch (subNode.family) {
      case 'Collection':
        const collLens = this.docLens.selectCollection(subName);
        return new CollectionFrame(subName, subNode, collLens);
      case 'PartitionedLog':
        return this.makePartitionedLog(subName, subNode);
      default:
        const fieldStack = [nameToField(subName)];
        const subLens = this.docLens.selectField(fieldStack);
        return constructFrame(subName, subNode, subLens);
    }
  }

  makePartitionedLog(subName, subNode) {
    const firestorePath = '/'+(subNode.hints.firestorePath || subName);
    const logFieldStack = firestorePath.slice(1).split('\/').map(nameToField);

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
      this.docLens.removeData();
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
    }, 'doc/subscribe');
  }

}
module.exports = DocumentFrame;
