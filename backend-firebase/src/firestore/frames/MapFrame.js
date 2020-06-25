const {constructFrame} = require('./_factory.js');

const innerWhitelist = [
  'Primitive',
  'Document',
  'Blob',
];

class MapFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, docLens) {
    if (!innerWhitelist.includes(nodeSpec.inner.family)) throw new Error(
      `TODO: MapFrame only supports ${innerWhitelist} entries, not ${nodeSpec.inner.family}`);
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  async getChildFrames() {
    const rawObj = await this.docLens.getData('map/getall');
    if (!rawObj) return [];
    return Object.keys(rawObj).map(key => {
      const subLens = this.docLens.selectField([key]);
      return constructFrame(key, this.nodeSpec.inner, subLens);
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

  putLiteral(input) {
    if (!input) {
      this.docLens.removeData();
      return;
    }
    if (input.Type !== 'Folder') throw new Error(
      `Maps must be stored as Folder entries`);

    this.docLens.setData({});
    for (const child of input.Children) {
      const subLens = this.docLens.selectField([child.Name]);
      const frame = constructFrame(child.Name, this.nodeSpec.inner, subLens);
      frame.putLiteral(child);
    }
  }

  selectName(key) {
    const subLens = this.docLens.selectField([key]);
    return constructFrame(key, this.nodeSpec.inner, subLens);
  }

  startSubscription(state, Depth) {
    return this.docLens.onSnapshot(async docSnap => {
      const frame = new MapFrame(this.name, this.nodeSpec, docSnap);
      const entry = await frame.getLiteral();
      if (entry) {
        state.offerPath('', entry);
      } else {
        state.removePath('');
      }
      state.markReady();
    }, error => {
      console.error('WARN: MapFrame#startSubscription snap error:',
          error.code, error.stack || error.message);
      state.markCrashed(error);
    }, 'map/subscribe');
  }

}
module.exports = MapFrame;
