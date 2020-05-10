import {BaseElement} from './_base.mjs';

export class Blob extends BaseElement {
  constructor(mimeType, encoding) {
    super();
    this.mimeType = mimeType;
    this.encoding = encoding || (mimeType.startsWith('text/') ? 'utf-8' : 'binary');
  }

  static family = "Blob";
  get config() {
    return {
      mimeType: this.mimeType,
      encoding: this.encoding,
    };
  }
}

  // '/userstyle': new DataTree.Blob('text/css', {
  //   '.css': 'text/css',
  //   '.scss': 'text/x-scss',
  // }),
