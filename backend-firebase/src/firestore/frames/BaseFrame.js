class BaseFrame {
  constructor(name, nodeSpec) {
    this.name = name;
    this.nodeSpec = nodeSpec;
  }

  get isComplex() {
    return ['Collection', 'PartitionedLog'].includes(this.nodeSpec.family);
  }
}
module.exports = BaseFrame;
