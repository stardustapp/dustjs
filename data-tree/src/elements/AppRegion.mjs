import {BaseTreeParentElement, TreeNode} from './_base.mjs';

export class AppRegion extends BaseTreeParentElement {
  constructor(regionName, childPaths) {
    super('Folder', childPaths);
    this.regionName = regionName;
  }

  static family = "AppRegion";
  get config() {
    return {
      regionName: this.regionName,
    };
  }
}
