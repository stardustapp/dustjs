import {BaseParentElement} from './_base.mjs';

export class StringMap extends BaseParentElement {

  static family = "Map";
  get config() {
    return {
      keyType: 'String',
    };
  }
}
