class BlobEntry {
  constructor(name, base64, mime) {
    this.Name = name;
    this.Type = 'Blob';
    this.Data = base64;
    this.Mime = mime;
  }

  static fromString(raw, mime='text/plain') {
    const encodedBytes = new TextEncoder('utf-8').encode(raw);
    const dataString = base64js.fromByteArray(encodedBytes);
    return new BlobEntry('blob', dataString, mime);
  }

  async asRealBlob() {
    const dataUrl = `data:${this.Mime};base64,${this.Data}`;
    const blobFetch = await fetch(dataUrl);
    return blobFetch.blob();
  }

  inspect() {
    return `<Blob ${JSON.stringify(this.Name)} ${JSON.stringify(this.Mime)}>`;
  }
}
exports.BlobEntry = BlobEntry;
