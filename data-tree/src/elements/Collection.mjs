import {BaseParentElement} from './_base.mjs';

export class Collection extends BaseParentElement {

  static family = "Collection";
  get config() {
    return {
      idType: 'Random',
    };
  }

}
