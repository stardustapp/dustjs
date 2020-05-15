const {constructFrame} = require('./_factory.js');

class MapFrame extends require('./BaseFrame.js') {
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
      this.docLens.clearData();
      return;
    }
    if (input.Type !== 'Folder') throw new Error(
      `Maps must be stored as Folder entries`);

    this.docLens.clearData();
    for (const child of input.Children) {
      const subLens = this.docLens.selectField([child]);
      const frame = constructFrame(child, this.nodeSpec.inner, subLens);
      frame.putLiteral(child);
    }
  }

  selectName(key) {
    const subLens = this.docLens.selectField([key]);
    return constructFrame(key, this.nodeSpec.inner, subLens);
  }

}
module.exports = MapFrame;
