export class ErrorEntry {
  constructor(name, code, authority, message) {
    this.Name = name;
    this.Type = 'Error';
    this.Code = code || 'nil';
    this.Authority = authority || 'nil';

    this.set(message);
  }

  set(message) {
    this.StringValue = message || '';
    if (typeof this.StringValue !== 'string') throw new Error(
      `ErrorEntry ${JSON.stringify(this.Name)} cannot contain a ${this.StringValue.constructor} message`);
  }

  inspect() {
    return `<Error ${JSON.stringify(this.Name)} ${JSON.stringify(this.Code)} ${JSON.stringify(this.Authority)} ${JSON.stringify(this.StringValue)}>`;
  }
}
