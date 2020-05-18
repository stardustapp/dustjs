const PrimitiveFrame = require('./PrimitiveFrame.js');
const {constructFrame} = require('./_factory.js');

const indexRegex = /^\d+$/;
class LogPartitionFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, lenses) {
    if (nodeSpec.innerMode !== 'AppendOnly') throw new Error(
      `LogPartitionFrame only supports AppendOnly logs`);

    super(name, nodeSpec);
    this.lenses = lenses; // horizon, latest, entries
  }

  async getLiteral() {
    if (this.lenses.horizon.rootDoc.hasSnap) {
      return {Name: this.name, Type: 'Folder', Children: [
        {Name: 'horizon', Type: 'String', StringValue: await this.lenses.horizon.getData('logpart/get')},
        {Name: 'latest', Type: 'String', StringValue: await this.lenses.latest.getData('logpart/get')},
      ]};
    } else {
      return {Name: this.name, Type: 'Folder'};
    }
  }

  async getChildFrames() {
    const logHorizon = await this.lenses.horizon.getData('logpart/listall');
    const logLatest = await this.lenses.latest.getData('logpart/listall');
    if (logHorizon == null || logLatest == null) {
      return []; // TODO: better handling of empty logs?
    }

    const entryFrames = [];
    for (let cursor = logHorizon; cursor <= logLatest; cursor++) {
      entryFrames.push(this.selectEntry(`${cursor}`));
    }

    return [
      new PrimitiveFrame('horizon', {type: 'Number'}, this.lenses.horizon),
      new PrimitiveFrame('latest', {type: 'Number'}, this.lenses.latest),
      ...entryFrames,
    ];
  }

  selectName(key) {
    switch (true) {
      case key === 'horizon' || key === 'latest':
        return new PrimitiveFrame(key, {type: 'Number'}, this.lenses[key]);
      case indexRegex.test(key):
        return this.selectEntry(key);
    }
  }

  selectEntry(key) {
    const entryLens = this.lenses.entries.selectDocument(key, {
      immutable: true,
    });
    return constructFrame(key, this.nodeSpec.inner, entryLens);
  }

}
module.exports = LogPartitionFrame;
