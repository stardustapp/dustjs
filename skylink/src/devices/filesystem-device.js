import path from 'path';

export class FilesystemDevice {
  constructor(fsRootPath) {
    this.fsRoot = path.resolve(fsRootPath);
  }

  getEntry(subPath) {
    const realPath = path.resolve(this.fsRoot, subPath.slice(1));
    if (realPath === this.fsRoot || realPath.startsWith(this.fsRoot+'/')) {
      return new FilesystemEntry(realPath);
    } else throw new Error(
      `Security Exception: FilesystemDevice refused subPath "${subPath}"`);
  }

  static fromUri(uri) {
    if (!uri.startsWith('file://')) throw new Error(
      `BUG: FilesystemDevice given non-file:// URI of scheme "${uri.split('://')[0]}"`);

    return new FilesystemDevice(uri.slice(7));
  }
}

export class FilesystemEntry {
  constructor(fsPath) {
    this.fsPath = fsPath;
  }

  async get() {
    const fs = await import('fs/promises');
    const stat = await fs.stat(this.fsPath);
    switch (true) {

      case stat.isFile():
        return {
          Type: 'Blob',
          Mime: 'application/octet-stream',
          Data: await fs.readFile(this.fsPath, {encoding: 'base64'}),
        };

      case stat.isDirectory():
        return {Type: 'Folder'};

      default: throw new Error(
        `BUG: Stat of "${fsPath}" was unidentified`);
    }
  }

  // TODO: more filesystem operations
  // async enumerate(enumer) {
  // }
}
