import {BaseParentElement} from './_base.mjs';

export class NamedCollection extends BaseParentElement {

  static family = "Collection";
  get config() {
    return {
      idType: 'Named',
    };
  }
}
