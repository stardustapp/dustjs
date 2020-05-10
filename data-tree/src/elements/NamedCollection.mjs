import {BaseParentElement} from './_base.mjs';

export class NamedCollection extends BaseParentElement {

  static family = "Collection";
  get config() {
    return {
      idType: 'Named',
    };
  }

  // compile(config) {
  //   return new NamedCollectionNode(
  //     base.processFields(this.fields, config));
  // }
}
//
// export class NamedCollectionNode extends base.BaseNode {
//   construcotr(fieldMap) {
//     this.fieldMap = fieldMap;
//   }
// }
