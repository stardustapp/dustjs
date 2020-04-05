class StringEntry {
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
exports.StringEntry = StringEntry;
