
class BlobFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  async getLiteral() {
    let data = await this.docLens.getData('blob/get');
    if (data == null) {
      if (true) return null; // TODO: determine when blobs should be visible
      // exposing null blobs has the benefit of providing the mime type to the agent
      data = Buffer.from('');
    } else if (typeof data === 'string') {
      data = Buffer.from(data, 'utf-8');
    } else if (data.constructor !== Buffer) throw new Error(
      `BUG: Blob from store was type ${data.constructor.name}`);

    return {
      Name: this.name,
      Type: 'Blob',
      Mime: this.nodeSpec.mimeType,
      Data: data.toString('base64'),
    };
  }

}
module.exports = BlobFrame;
