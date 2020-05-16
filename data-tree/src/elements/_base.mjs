export class TreeNode {
  constructor(family, config={}) {
    this.family = family;
    for (const confKey in config) {
      this[confKey] = config[confKey];
    }
  }
}

export class BaseElement {
  static family = "TODO";
  get config() {
    return {};
  }

  makeNode(compiler) {
    return new TreeNode(
      this.constructor.family,
      this.config);
  }
}

export class BaseParentElement extends BaseElement {
  constructor(childSpec) {
    super();
    this.childSpec = childSpec;
  }

  makeNode(compiler) {
    return new TreeNode(
      this.constructor.family,
      {
        ...this.config,
        inner: compiler.mapChildSpec(this.childSpec),
      });
  }
}
