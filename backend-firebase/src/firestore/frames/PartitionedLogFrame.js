const PrimitiveFrame = require('./PrimitiveFrame.js');
const LogPartitionFrame = require('./LogPartitionFrame.js');

const moment = require('moment');
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
class PartitionedLogFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, lenses) {
    if (nodeSpec.partitionBy !== 'Date') throw new Error(
      `TODO: PartitionedLogFrame only supports Date partitions`);

    super(name, nodeSpec);
    this.lenses = lenses; // horizon, latest, partitions
  }

  async getChildFrames() {
    const horizonStr = await this.lenses.horizon.getData('log/listall');
    const latestStr = await this.lenses.latest.getData('log/listall');
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
      new PrimitiveFrame('horizon', {type: 'String'}, this.lenses.horizon),
      new PrimitiveFrame('latest', {type: 'String'}, this.lenses.latest),
      ...partitionFrames,
    ];
  }

  selectName(key) {
    switch (true) {
      case key === 'horizon' || key === 'latest':
        return new PrimitiveFrame(key, {type: 'String'}, this.lenses[key]);
      case dateRegex.test(key):
        return this.selectPartition(key);
    }
  }

  selectPartition(dateStr) {
    const logDocLens = this.lenses.partitions.selectDocument(dateStr);
    // TODO: this isn't not nodeSpec.inner - there's no AOF log node yet
    return new LogPartitionFrame(dateStr, this.nodeSpec, {
      horizon: logDocLens.selectField([`logHorizon`]),
      latest: logDocLens.selectField([`logLatest`]),
      entries: logDocLens.selectCollection('entries'),
    });
  }

}
module.exports = PartitionedLogFrame;
