import {BaseElement} from './_base.mjs';

export class Primitive extends BaseElement {
  constructor(jsConstr) {
    super();
    this.jsType = jsConstr.name;
  }

  static family = "Primitive";
  get config() {
    return {
      type: this.jsType,
    };
  }
}
