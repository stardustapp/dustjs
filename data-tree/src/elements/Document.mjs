import {BaseElement, TreeNode} from './_base.mjs';

export class Document extends BaseElement {
  constructor(fieldsSpec) {
    super();
    this.fieldsSpec = fieldsSpec;
  }

  static family = "Document";
  // get config() {
  //   return {
  //     idType: 'random',
  //   };
  // }

  makeNode(compiler) {
    const fieldMap = new Array;
    for (const path in this.fieldsSpec) {
      fieldMap.push([path, compiler.mapChildSpec(this.fieldsSpec[path])]);
    }

    return new TreeNode(
      this.constructor.family, {
        fields: fieldMap
      });
  }
}
