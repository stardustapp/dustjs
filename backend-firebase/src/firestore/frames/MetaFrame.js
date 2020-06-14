const ValidMetaTypes = new Set([
  'doc id',
]);

class MetaFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  async getLiteral() {
    switch (this.nodeSpec.type) {
      case 'doc id':
        return { Name: this.name, Type: 'String', StringValue: this.docLens.rootDoc.id };
      default: throw new Error(
        `BUG: MetaFrame#getLiteral() of unknown type ${this.nodeSpec.type}`);
    }
  }

  putLiteral(input) {
    switch (this.nodeSpec.type) {
      case 'doc id':
        this.docLens.setData(this.docLens.rootDoc.id);
        return;
      default: throw new Error(
        `BUG: MetaFrame#putLiteral() of unknown type ${this.nodeSpec.type}`);
    }
  }
}
module.exports = MetaFrame;
