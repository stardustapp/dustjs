// DYING. TODO: REVIVE.

class RawLevelStore extends BaseBackend {
  constructor(opts, database) {
    super(opts);
    this.database = database;
  }

  static async new(opts) {
    const serverDb = await ServerDatabase.open(opts.dataPath);
    console.debug('Opened level database at', opts.dataPath);
    return await BaseBackend.newFromImpl(RawVolatileStore, opts);
  }

  /*
  async close() {
    this.transact('readonly', async txn => {
      clearInterval(this.warnInterval);
      console.warn('Closing IDB');
      const shutdown = this.idb.close();
      this.idb = null;
      await shutdown;
    });
  }
  */

  //await this.database.rawLevel.batch(batches);

/*
  async flushActions() {
    const batches = this.generateBatch();
    if (batches.length > 0) {
      console.debug('Processing transaction actions...');

      for (const processor of this.actionProcessors) {
        await processor(this, this.actions);
      }

      await this.database.rawLevel.batch(batches);
      console.log('\r  --> Applied', batches.length, 'database ops',
        'from', this.actions.length, 'graph ops.');
    }
  }

  generateBatch() {
    //console.debug('TODO: actions taken:', this.actions);
    const batch = new Array;
    for (const action of this.actions) {
      switch (action.kind) {

        case 'put edge':
          const subBatch = this.graphStore.database.rawGraph.generateBatch(action.record);
          for (const subItem of subBatch) {
            batch.push(subItem);
          }
          break;

        case 'put node':
          const json = JSON.stringify({
            type: action.proxyTarget.typeName,
            fields: action.proxyTarget.fields,
          });
          batch.push({type: 'put', key: 'doc::'+action.proxyTarget.nodeId, value: json});
          break;

        default:
          console.log('unimpl action', action.kind);
          throw new Error(`weird action '${action.kind}'`);
      }
    }
    return batch;
  }
*/
  async loadNodeById(nodeId) {
    const myErr = new Error();
    try {
      const docJson = await this.database.rawLevel.get('doc::'+nodeId);
      return JSON.parse(docJson); // {type, fields}
    } catch (err) {
      myErr.message = `Encountered ${err.type} loading node '${nodeId}' from RawLevelStore`;
      myErr.status = err.status;
      throw myErr;
    }
  }

  async writeNode(nodeId, data) {
    const json = JSON.stringify(data);
    await this.database.rawLevel.put('doc::'+nodeId, json);
  }

  /*async*/ fetchEdges() {
    return this.database.rawGraph.get(this.query);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    RawLevelStore,
  };
}
