class GraphEdge {
  constructor(graphCtx, record) {
    Object.defineProperty(this, 'graphCtx', {
      enumerable: false,
      value: graphCtx,
    });
    this.record = record;

    this.isDirty = false;
    graphCtx.allEdges.push(this);
  }

  markDirty() {
    this.isDirty = true;
  }
  flush() {
    this.isDirty = false;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphEdge,
  };
}
