import {BaseTreeParentElement, TreeNode} from './_base.mjs';

export class Document extends BaseTreeParentElement {
  constructor(fieldsSpec) {
    super('Document', fieldsSpec);
  }

  static family = "Document";
}
