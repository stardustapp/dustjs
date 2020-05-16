const {constructFrame} = require('./_factory.js');

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
    const document = this.collLens.selectDocument(name);
    return constructFrame(name, this.nodeSpec.inner, document);
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
      frame.putLiteral(entry);
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