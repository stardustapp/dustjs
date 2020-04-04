class NodeAccessor extends FieldAccessor {
  constructor(type) {
    super(type);
    this.typeName = type.name;

    this.structType = FieldAccessor.forType(type.inner);
    const structConstr = this.structType.constructor;
    if (structConstr !== StructAccessor) throw new Error(
      `Unsupported NodeAccessor inner type ${structConstr.name}`);

    this.predicates = new Map;
    for (const rel of type.relations) {
      if (!rel.predicate) continue;
      if (!this.predicates.has(rel.predicate))
        this.predicates.set(rel.predicate, new Array);
      this.predicates.get(rel.predicate).push(rel);
    }
  }

  mapOut(storeNode, graphCtx) {
    const node = new GraphNode(graphCtx.ctxId, storeNode.nodeId, this.typeName);

    const struct = this.structType.mapOut(storeNode.recordData, graphCtx, node);
    for (const key in struct) {
      if (key === 'isDirty') throw new Error(
        `Copying a NodeAccessor!`);
      const definition = Object.getOwnPropertyDescriptor(struct, key);
      Object.defineProperty(node, key, definition);
    }

    for (const [predicate, edges] of this.predicates) {
      //console.log('defining', predicate)
      Object.defineProperty(node, predicate, {
        value: new RelationAccessor(graphCtx, node, edges, predicate),
        enumerable: true,
      });
    }

    const behavior = graphCtx.engine.nameBehaviors.get(this.typeName);
    // if (!behavior) console.log(`! Missing type behavior for ${this.typeName} in ${graphCtx.engine.engineKey}`);
    //console.log('mapOut behavior', this.typeName, storeNode.nodeId, graphCtx.engine.engineKey, Object.keys(behavior || {missing:true}))
    for (const key in behavior) {
      Object.defineProperty(node, key, {
        value: behavior[key],
      });
    }

    Object.defineProperty(node, 'exportData', {
      value: (opts) => {
        const storedNode = graphCtx.storedNodes.peek(node.nodeId);
        return this.exportData(storedNode, opts);
      },
    });

    return node;
  }

  mapIn(newData, graphCtx, node) {
    return this.structType.mapIn(newData, graphCtx, node);
  }

  gatherRefs(node, refs) {
    //console.log('gather refs', node)
    this.structType.gatherRefs(node, refs);
  }
  exportData(node, opts) {
    return this.structType.exportData(node.recordData, opts);
  }

  getKeySet() {
    return new Set(this.structType.fields.keys());
  }
}

accessorConstructors.set(NodeBuilder, NodeAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    NodeAccessor,
  };
}
