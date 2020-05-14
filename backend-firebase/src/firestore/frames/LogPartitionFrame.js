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

  async getChildFrames() {
    const logHorizon = await this.lenses.horizon.getData();
    const logLatest = await this.lenses.latest.getData();
    if (logHorizon == null || logLatest == null) {
      return []; // TODO: better handling of empty logs?
    }

    const entryFrames = [];
    for (let cursor = logHorizon; cursor <= logLatest; cursor++) {
      const entryId = `${cursor}`;
      const entryLens = this.lenses.entries.selectDocument(entryId);
      entryFrames.push(constructFrame(entryId, this.nodeSpec.inner, entryLens));
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
        const entryLens = this.lenses.entries.selectDocument(key);
        return constructFrame(key, this.nodeSpec.inner, entryLens);
    }
  }

}
module.exports = LogPartitionFrame;
