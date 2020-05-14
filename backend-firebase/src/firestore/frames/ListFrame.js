const {constructFrame} = require('./_factory.js');

const indexRegex = /^\d+$/;
class ListFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, docLens) {
    if (nodeSpec.inner.family !== 'Primitive') throw new Error(
      `ListFrame only supports Primitive entries`);

    super(name, nodeSpec);
    this.docLens = docLens;
  }

  async getChildFrames() {
    const data = await this.docLens.getData();
    if (!data) return [];
    return data.map((val, idx) => {
      const subLens = this.docLens.selectField([`${idx}`], {readOnly: true});
      return constructFrame(`${idx+1}`, this.nodeSpec.inner, subLens);
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

  selectName(name) {
    if (!indexRegex.test(name)) return;
    const index = parseInt(name) - 1;
    if (index < 0) return;

    const subLens = this.docLens.selectField([`${index}`], {readOnly: true});
    return constructFrame(name, this.nodeSpec.inner, subLens);
  }

  startSubscription(state, Depth) {
    return this.docLens.onSnapshot(async docSnap => {
      const frame = new ListFrame(this.name, this.nodeSpec, docSnap);
      const entry = await frame.getLiteral();
      if (entry) {
        state.offerPath('', entry);
      } else {
        state.removePath('');
      }
      state.markReady();
    }, error => {
      console.error('WARN: ListFrame#startSubscription snap error:',
          error.code, error.stack || error.message);
      state.markCrashed(error);
    });
  }

}
module.exports = ListFrame;
