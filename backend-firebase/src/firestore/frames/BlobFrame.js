
class BlobFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  get fullMime() {
    const {mimeType, encoding} = this.nodeSpec;
    if (encoding) {
      return `${mimeType}; charset=${encoding}`;
    }
    return mimeType;
  }

  async getLiteral() {
    const raw = await this.docLens.getData('blob/get');
    if (!raw) return null;
    let [mimeType, data] = raw;

    if (data == null) {
      data = Buffer.from('');
    } else if (typeof data === 'string') {
      data = Buffer.from(data, this.nodeSpec.encoding || 'utf-8'); // TODO
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
    // support deletion
    if (!input) {
      this.docLens.removeData();
      return;
    }
    const mimeType = this.fullMime;

    if (input.Type !== 'Blob') throw new Error(
      `Blob fields must be put as Blob entries`);
    if (/*input.Mime && */input.Mime !== mimeType) throw new Error(
      `This Blob must be of type "${mimeType}", you gave "${input.Mime}"`);

    const data = Buffer.from(input.Data, 'base64');
    if (data.length > 15*1024) throw new Error(
      `TODO: Inline Blobs max at 15KiB`);

    if (mimeType.startsWith('text/')) {
      this.docLens.setData([mimeType, data.toString(this.nodeSpec.encoding)]);
    } else {
      this.docLens.setData([mimeType, data]);
    }
  }

}
module.exports = BlobFrame;
