const {constructFrame} = require('./_factory.js');
const {StringEntry, EnumerationWriter} = require('@dustjs/skylink');

class CollectionFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, collLens) {
    super(name, nodeSpec);
    this.collLens = collLens;
  }

  getLiteral() {
    return { Name: this.name, Type: 'Folder' };
  }

  async getChildFrames() {
    const documents = await this.collLens.getAllSnapshots();
    return documents.map(document =>
      constructFrame(document.id, this.nodeSpec.inner, document));
  }

  selectName(name) {
    // __...__ is reserved by Firestore
    if (name.startsWith('__') && name.endsWith('__')) return false;

    const document = this.collLens.selectDocument(name);
    return constructFrame(name, this.nodeSpec.inner, document);
  }

  async invoke_create(input) {
    // apparently firestore is cool just making an ID and assuming it's free
    // 'create' is still a first class function for backends that actually care
    const newLens = this.collLens.selectDocument(Symbol.for('newDoc'));
    const newFrame = constructFrame(newLens.id, this.nodeSpec.inner, newLens);
    newFrame.putLiteral(input);
    return new StringEntry('id', newLens.id);
  }

  async invoke_query(input, walker) {
    const opts = {
      filter: input.Children.filter(x => x.Name === 'filter').map(x => ({
        field: x.Children.find(x => x.Name === 'field').StringValue,
        operation: x.Children.find(x => x.Name === 'operation').StringValue,
        value: x.Children.find(x => x.Name === 'value').StringValue,
      }))[0],
      // .where(filter.field, filter.operation, filter.value);
      orderBy: input.Children.filter(x => x.Name === 'order-by').map(x => ({
        field: x.Children.find(x => x.Name === 'field').StringValue,
        direction: x.Children.find(x => x.Name === 'direction').StringValue,
      }))[0],
      // .orderBy(orderBy.field, orderBy.direction);
      limit: input.Children.filter(x => x.Name === 'limit').map(x => parseInt(x.StringValue))[0],
      // .limit(limit);
      startAfter: input.Children.filter(x => x.Name === 'start-after').map(x => x.StringValue)[0],
      // .startAfter(startAfter);
    };
    // console.log(input, opts);

    const documents = await this.collLens.getSomeSnapshots(opts);
    const frames = documents.map(document =>
      constructFrame(document.id, this.nodeSpec.inner, document));

    const entryApi = walker.getEntryApi();
    const enumer = new EnumerationWriter(2);
    enumer.visit({Type: 'Folder'});
    for (const subFrame of frames) {
      walker.pushFrame(subFrame);
      enumer.descend(subFrame.name);
      await entryApi.enumerate(enumer);
      enumer.ascend();
      walker.popFrame();
    }

    return enumer.toOutput();
  }

  putLiteral(input) {
    // if (!input) {
    //   this.docLens.clearData();
    //   return;
    // }
    // if (input.Type !== 'Folder') throw new Error(
    //   `Documents must be stored as Folder entries`);

    if (input && input.Type !== 'Folder') throw new Error(
      `Collections must be put as Folder entries`);

    // first: delete everything
    this.collLens.deleteAll();
    if (!input) return;

    // second: write everything
    for (const entry of input.Children) {
      const frame = this.selectName(entry.Name);
      if (frame) frame.putLiteral(entry);
    }
    console.log('wrote', input.Children.length, 'entries into', this.collLens);
  }

  startSubscription(state, Depth) {
    return this.collLens.onSnapshot(async querySnap => {
      state.offerPath('', {Type: 'Folder'});

      // console.log('onSnapshot', querySnap.docChanges());
      for (const docChange of querySnap.docChanges()) {
        switch (docChange.type) {
          case 'added':
          case 'modified':
            if (Depth > 1) {
              const frame = constructFrame(docChange.doc.id, this.nodeSpec.inner, docChange.doc);
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
    }, 'collection/subscribe');
  }

}
module.exports = CollectionFrame;
