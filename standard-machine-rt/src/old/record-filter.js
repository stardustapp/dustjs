class RecordFilter {
  constructor({sourceSpec, filterFunc, sort, fields, limit}) {
    this.sourceSpec = sourceSpec;
    this.filterFunc = filterFunc;
    this.sort = sort;
    this.fields = fields;
    this.limit = limit;

    this.children = new Array;
    this.built = false;

    this.subs = new Set;
  }

  // It's like if the builder pattern didn't feel like doing much that day.
  addChild(childPub) {
    if (this.built) throw new Error(
      `Publication already built, can't add more children`);
    this.children.push(childPub);
    return this;
  }
  build() {
    if (this.built) throw new Error(
      `Publication already built, can't rebuild`);
    this.built = true;
    return this;
  }

  subscribe(streamSource, params={}) {
    if (!this.built) throw new Error(
      `Publication not done building, can't use yet`);

    // Get the unfiltered (though ideally type-filtered) upstream view
    let stream = streamSource(this.sourceSpec);
    // NOTE that these streams are on _arrays_ of docs

    // filter to relevant documents
    if (this.filterFunc) {
      stream = stream.filterItems(doc => {
        return this.filterFunc(doc, {params});
      });
    }

    // select the most relevant documents
    if (this.sort)
      stream = stream.sortBy(this.sort); // TODO
    if (this.limit)
      stream = stream.limitTo(this.limit); // TODO

    // transpose to relevant fields
    if (this.fields) {
      stream = stream.mapItems(doc => {
        const data = {
          recordId: doc.recordId,
          version: doc.version,
        };
        for (const key of Object.keys(this.fields)) {
          if (key in doc) {
            data[key] = doc[key];
          }
        }
        return data;
      });
    }

    // TODO: add children!!
    // For each child, should probably have a Map<Id,Subscription)

    return stream;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    RecordFilter,
  };
}
