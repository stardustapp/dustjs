class FunctionDevice {
  constructor({invoke}) {
    this.invokeCb = invoke;
  }
  async getEntry(path) {
    switch (path) {
      case '':
        return {
          get: () => Promise.resolve(new FolderEntry('function', [
            {Name: 'invoke', Type: 'Function'},
          ])),
          async enumerate(enumer) {
            enumer.visit({Type: 'Folder'});
            if (enumer.canDescend()) {
              enumer.descend('invoke');
              enumer.visit({Type: 'Function'});
              enumer.ascend();
            }
          },
        };
      case '/invoke':
        return {
          get: () => Promise.resolve({
            Name: 'invoke', Type: 'Function',
          }),
          invoke: this.invokeCb,
        };
      default:
        throw new Error(`function devices only have /invoke`);
    }
  }
}

module.exports = {
  FunctionDevice,
};
