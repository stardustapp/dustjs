import {BaseElement} from './_base.mjs';

const ValidMetaTypes = new Set([
  'doc id',
]);

export class Meta extends BaseElement {
  constructor(metaStr) {
    super();

    if (!ValidMetaTypes.has(metaStr)) throw new Error(
      `Meta string "${metaStr}" not expected`);
    this.metaStr = metaStr;
  }

  static family = "Meta";
  get config() {
    return {
      type: this.metaStr,
    };
  }
}
