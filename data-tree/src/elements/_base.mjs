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

export class BaseTreeParentElement extends BaseElement {
  constructor(virtualFamily, childPaths) {
    super();
    this.virtualFamily = virtualFamily;
    this.childPaths = childPaths;
  }

  makeNode(compiler) {
    const {family} = this.constructor;
    
    const nameMap = new Map;
    for (const path in this.childPaths) {
      const pathNames = compiler.pathParser(path);
      const innerNode = compiler.mapChildSpec(this.childPaths[path]);
      if (pathNames.length === 0) throw new Error(
        `BUG: ${family} given zero-length child path "${path}"`);

      let currMap = nameMap;
      while (pathNames.length > 1) {
        const nextName = pathNames.shift();
        if (!currMap.has(nextName)) {
          currMap.set(nextName, new TreeNode(this.virtualFamily, {
            names: new Map,
          }));
        }

        currMap = currMap.get(nextName);
        if (currMap.family !== this.virtualFamily) throw new Error(
          `BUG: ${family} found non-${this.virtualFamily} trying to store path "${path}"`);
        currMap = currMap.names;
        if (currMap.constructor !== Map) throw new Error(
          `BUG: ${family} found non-Map trying to store path "${path}"`);
      }

      const lastName = pathNames.shift();
      if (currMap.has(lastName)) throw new Error(
        `BUG: ${family} found existing item where path "${path}" goes`);
      currMap.set(lastName, innerNode);
    }

    return new TreeNode(
      this.constructor.family, {
        ...this.config,
        names: nameMap,
      });
  }
}
