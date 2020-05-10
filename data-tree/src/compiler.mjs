import * as Elements from './elements/_index.mjs';
import {TreeNode, BaseElement} from './elements/_base.mjs';
// import {TreeNode} from './tree-node.mjs';
import * as util from 'util';

export class Compiler {
  constructor({
    target,
    pathParser,
  }) {
    this.target = target;
    this.pathParser = pathParser || (x=>x);
  }

  compile(regions) {
    const regionMap = new Map;
    for (const region in regions) {
      const rootMap = new Array;
      regionMap.set(region, rootMap);
      for (const rootPath in regions[region]) {
        const node = this.compileElement(regions[region][rootPath]);
        rootMap.push([this.pathParser(rootPath), node]);
      }
    }
    return regionMap;
  }

  // config.cacheMap = config.cacheMap || new Map;
  // if (config.objectMap.has(subPaths)) {
  //   return config.objectMap.get(subPaths);
  // }

  mapChildSpec(childSpec) {
      switch (true) {
        case childSpec instanceof BaseElement:
          return childSpec.makeNode(this);

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

  compileElement(rootElement) {
    // console.log(rootElement)
    const rootNode = rootElement.makeNode(this);
    // console.log('TODO: "compiled"', rootNode);

    // console.log('-->', util.inspect(rootNode, {
    //   showHidden: false, depth: null, colors: true}));

    return rootNode;
    // TreeNode {
    //   constructor(family, config, child
  }
}
