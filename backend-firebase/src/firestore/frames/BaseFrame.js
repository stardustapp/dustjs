class BaseFrame {
  constructor(name, nodeSpec) {
    this.name = name;
    this.nodeSpec = nodeSpec;
  }

  selectPath(path) {
    // console.log('selecting path', path, 'from', this);
    if (path.count() < 1) throw new Error(
      `BUG: selectPath wants a path`);
    const nextFrame = this.selectName(path.names[0]);
    if (nextFrame) {
      const remainingPath = path.slice(1);
      return { nextFrame, remainingPath };
    } else {
      return {};
    }
  }

}
module.exports = BaseFrame;
