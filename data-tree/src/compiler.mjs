import * as util from 'util';

import * as Elements from './elements/_index.mjs';
import {TreeNode, BaseElement} from './elements/_base.mjs';
import {parseAbsolutePath} from './path-parser.js';

export class Compiler {
  constructor({
    target,
  }) {
    this.target = target;
    this.pathParser = parseAbsolutePath;
  }

  compile(app) {
    return {
      ...app,
      roots: app.roots.map(root => {
        return root.makeNode(this);
      }),
      getAppRegion(name) {
        return this.roots.find(x =>
          x.family === 'AppRegion' &&
          x.regionName === name);
      },
    };
  }

  mapChildSpec(childSpec) {
    switch (true) {
      case childSpec instanceof BaseElement:
        return childSpec.makeNode(this);

      case childSpec.constructor === Symbol:
        return new Elements.Meta(childSpec.description).makeNode(this);

      case childSpec.constructor === Object:
        return new Elements.Document(childSpec).makeNode(this);

      case childSpec.constructor === Array && childSpec.length === 1:
        return new Elements.List(childSpec[0]).makeNode(this);

      case [String,Number,Date,Boolean].includes(childSpec):
        return new Elements.Primitive(childSpec).makeNode(this);

      default: throw new Error(
        `TODO: Compiler#mapChildSpec default case`);
    }
  }
}
