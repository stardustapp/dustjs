const {Timestamp} = require('firebase-admin').firestore;
const {parseDateStringOrThrow} = require('../util.js');

class PrimitiveFrame extends require('./BaseFrame.js') {
  constructor(name, nodeSpec, docLens) {
    super(name, nodeSpec);
    this.docLens = docLens;
  }

  async getLiteral() {
    const stringVal = await this.getStringValue();
    if (stringVal === null) {
      return null;
    } else {
      return { Name: this.name, Type: 'String', StringValue: stringVal };
    }
  }

  putLiteral(input) {
    // support deletion
    if (!input) {
      this.docLens.removeData();
      return;
    }
    if (input.Type !== 'String') throw new Error(
      `Primitive fields must be put as String entries`);

    const newValue = this.fromStringValue(input.StringValue || '');
    this.docLens.setData(newValue);
  }

  async getStringValue() {
    const raw = await this.docLens.getData('primitive/get');
    if (raw == null) return null;
    switch (this.nodeSpec.type) {
      case 'String':
        return `${raw}`;
      case 'Boolean':
        return raw ? 'yes' : 'no';
      case 'Number':
        return `${raw || 0}`;
      case 'Date':
        return raw ? raw.toDate().toISOString() : null;
      default:
        console.log('i have data', raw, this.nodeSpec);
        throw new Error(`TODO: unmapped DataTree field for ${this.name}`);
    }
  }

  fromStringValue(val) {
    if (val == null) return null;
    switch (this.nodeSpec.type) {
      case 'String':
        return val || '';
      case 'Boolean':
        return val === 'yes';
      case 'Number':
        return parseFloat(val);
      case 'Date':
        return Timestamp.fromDate(parseDateStringOrThrow(val));
      default:
        console.log('i have data', val, this.nodeSpec);
        throw new Error(`TODO: unmapped DataTree field for ${this.name}`);
    }
  }

  startSubscription(state, Depth) {
    return this.docLens.onSnapshot(async docSnap => {
      const frame = new PrimitiveFrame(this.name, this.nodeSpec, docSnap);
      const entry = await frame.getLiteral();
      if (entry) {
        state.offerPath('', entry);
      } else {
        state.removePath('');
      }
      state.markReady();
    }, error => {
      console.error('WARN: PrimitiveFrame#startSubscription snap error:',
          error.code, error.stack || error.message);
      state.markCrashed(error);
    }, 'primitive/subscribe');
  }

}
module.exports = PrimitiveFrame;
