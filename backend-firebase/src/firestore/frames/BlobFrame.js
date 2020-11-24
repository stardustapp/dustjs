
class BlobFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  get fullMime() {
    const {mimeType, encoding} = this.nodeSpec;
    if (mimeType && encoding && encoding !== 'binary') {
      return `${mimeType}; charset=${encoding}`;
    }
    return mimeType;
  }

  async getLiteral() {
    const raw = await this.docLens.getData('blob/get');
    if (!raw) return null;
    let [mimeType, data] = raw;
    const parsedMime = parseMime(mimeType);

    if (data == null) {
      data = Buffer.from('');
    } else if (typeof data === 'string') {
      if (!parsedMime.attrs.charset) throw new Error(
        `BUG: Blob was stored as string without an attached charset`);
      data = Buffer.from(data, parsedMime.attrs.charset);
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

    if (input.Type !== 'Blob') throw new Error(
      `Blob fields must be put as Blob entries`);
    if (this.fullMime && this.fullMime !== input.Mime) throw new Error(
      `This Blob must be of type "${this.fullMime}", you gave "${input.Mime}"`);

    const mimeType = input.Mime || this.fullMime;
    if (!mimeType) throw new Error(
      `MIME Type is required here because there's no default set`);

    const data = Buffer.from(input.Data, 'base64');
    if (data.length > 15*1024) throw new Error(
      `TODO: Inline Blobs max at 15KiB`);

    const parsedMime = parseMime(mimeType);

    if (parsedMime.attrs.charset === 'utf-8') {
      this.docLens.setData([mimeType, data.toString('utf-8')]);
    } else {
      this.docLens.setData([mimeType, data]);
    }
  }

}
module.exports = BlobFrame;

function parseMime(mime) {
  const [type, ...attrList] = mime.split(';');
  const attrs = {};
  for (const attr of attrList) {
    const [key, ...val] = attr.trim().split('=');
    attrs[key] = val.join('=');
  }
  return { type, attrs };
}
