class Skychart {
  constructor(skylinkP) {
    this.skylinkP = skylinkP;
  }

  static openChart(chartOverride) {
    return Skylink.openChart(chartOverride)
  }

  static manageChart(chartName) {
    if (!chartName) {
      throw new Error("Must specify a chart to manage");
    }

    const endpoint = 'ws' + location.origin.slice(4) + '/~~export/ws';
    const skychart = new Skylink('', endpoint);
    return new Skychart(skychart
      .invoke('/pub/open/invoke', Skylink.String('', chartName), '/tmp/chart')
      .then(() => skychart.invoke('/tmp/chart/manage/invoke', null, '/tmp/manage'))
      .then(() => new Skylink('/tmp/manage', skychart)));
  }

  findMount(mountPath) {
    return this.skylinkP
      .then(x => x.enumerate('/entries', { maxDepth: 2 }))
      .then(l => {
        var entryId;
        l.forEach(x => {
          const parts = x.Name.split('/');
          if (parts[1] === 'mount-path' && x.StringValue === mountPath) {
            entryId = parts[0];
          }
        });

        if (!entryId) {
          return null;
        }

        const entry = {};
        l.forEach(x => {
          const parts = x.Name.split('/');
          if (parts[0] === entryId && parts.length === 2 && x.Type === 'String') {
            entry[parts[1]] = x.StringValue;
          }
        });
        return entry;
      });
  }

  addEntry(entry) {
    return this.skylinkP
      .then(x => x.storeRandom('/entries', entry));
  }

  compile() {
    return this.skylinkP
      .then(x => x.invoke('/compile/invoke'));
  }
}