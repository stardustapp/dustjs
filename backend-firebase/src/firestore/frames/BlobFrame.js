
class BlobFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  async getLiteral() {
    const raw = await this.docLens.getData('blob/get');
    if (!raw) return null;
    let [mimeType, data] = raw;

    if (data == null) {
      data = Buffer.from('');
    } else if (typeof data === 'string') {
      data = Buffer.from(data, 'utf-8');
    } else if (data.constructor !== Buffer) throw new Error(
      `BUG: Blob from store was type ${data.constructor.name}`);

    return {
      Name: this.name,
      Type: 'Blob',
      Mime: mimeType,
      Data: data.toString('base64'),
    };
  }

  putLiteral(input) {
    const {mimeType} = this.nodeSpec;

    // support deletion
    if (!input) {
      this.docLens.clearData();
      return;
    }

    if (input.Type !== 'Blob') throw new Error(
      `Blob fields must be put as Blob entries`);
    if (/*input.Mime && */input.Mime !== mimeType) throw new Error(
      `This Blob must be of type "${mimeType}", you gave "${input.Mime}"`);

    const data = Buffer.from(input.Data, 'base64');
    if (data.length > 15*1024) throw new Error(
      `TODO: Inline Blobs max at 15KiB`);

    if (mimeType.startsWith('text/')) {
      this.docLens.setData([mimeType, data.toString('utf-8')]);
    } else {
      this.docLens.setData([mimeType, data]);
    }
  }

}
module.exports = BlobFrame;
