import {BaseElement} from './_base.mjs';

export class CompiledFile extends BaseElement {
  constructor(targetMime, extensionObj) {
    super();
    this.targetMime = targetMime;
    this.extensionMap = new Map;

    for (const extension in extensionObj) {
      this.extensionMap.set(extension, extensionObj[extension]);
    }
  }

  static family = "MimeFile";
  get config() {
    return {
      // TODO: design at what will use this, and solidify it
      flowDirection: 'CompiledToDefault',
      defaultMime: this.targetMime,
      sourceOptions: this.extensionMap,
    };
  }
}

  // '/userstyle': new DataTree.CompiledFile('text/css', {
  //   '.css': 'text/css',
  //   '.scss': 'text/x-scss',
  // }),
