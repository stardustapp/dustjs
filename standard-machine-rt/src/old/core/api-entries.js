class FolderLiteral {
  constructor(name, children) {
    this.Name = name;
    this.Type = 'Folder';
    this.Children = children || [];
  }

  append(child) {
    if (child.constructor === String) {
      this.Children.push({Name: child});
    } else {
      this.Children.push(child);
    }
  }

  // Helper to fetch one direct descendant, with optional useful checking
  getChild(name, required, typeCheck) {
    const child = this.Children.find(x => x.Name === name);
    if (required && (!child || !child.Type)) {
      throw new Error(`getChild(${JSON.stringify(name)}) on ${JSON.stringify(this.Name)} failed but was marked required`);
    }
    if (typeCheck && child && child.Type !== typeCheck) {
      throw new Error(`getChild(${JSON.stringify(name)}) on ${JSON.stringify(this.Name)} found a ${child.Type} but ${typeCheck} was required`);
    }
    return child;
  }

  inspect() {
    const childStr = this.Children.map(x => x.inspect()).join(', ');
    return `<Folder ${JSON.stringify(this.Name)} [${childStr}]>`;
  }
}

class StringLiteral {
  constructor(name, value) {
    this.Name = name;
    this.Type = 'String';

    this.set(value);
  }

  set(value) {
    this.StringValue = value || '';
    if (this.StringValue.constructor !== String) {
      throw new Error(`StringLiteral ${JSON.stringify(this.Name)} cannot contain a ${this.StringValue.constructor} value`);
    }
  }

  inspect() {
    return `<String ${JSON.stringify(this.Name)} ${JSON.stringify(this.StringValue)}>`;
  }
}

class BlobLiteral {
  constructor(name, base64, mime) {
    this.Name = name;
    this.Type = 'Blob';
    this.Data = base64;
    this.Mime = mime;
  }

  static fromString(raw, mime='text/plain') {
    const encodedBytes = new TextEncoder('utf-8').encode(raw);
    const dataString = base64js.fromByteArray(encodedBytes);
    return new BlobLiteral('blob', dataString, mime);
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

InflateSkylinkLiteral = function InflateSkylinkLiteral(raw) {
  if (!raw) {
    return null;
  }
  if (raw.constructor !== Object) {
    throw new Error(`Raw skylink literal wasn't an Object, please read the docs`);
  }
  if (!raw.Type) {
    throw new Error(`Raw skylink literal ${JSON.stringify(raw.Name||raw)} didn't have a Type, please check your payload`);
  }
  switch (raw.Type) {

    case 'String':
      return new StringLiteral(raw.Name || '', raw.StringValue);

    case 'Folder':
      const folder = new FolderLiteral(raw.Name || '');
      (raw.Children || []).forEach(child => {
        folder.append(InflateSkylinkLiteral(child))
      });
      return folder;

    case 'Blob':
      return new BlobLiteral(raw.Name || '', raw.Data, raw.Mime);

    case 'JS':
      return raw.Data;

    default:
      throw new Error(`skylink literal had unimpl Type ${raw.Type}`);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    FolderLiteral,
    StringLiteral,
    BlobLiteral,
    InflateSkylinkLiteral,
  };
}
