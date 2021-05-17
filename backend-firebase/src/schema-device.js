const {PathFragment} = require('@dustjs/skylink');

class SchemaDevice {
  constructor(appMap) {
    this.appMap = appMap;
  }
  getEntry(rawPath) {
    if (rawPath.length <= 1) {
      return {
        enumerate: async enumer => {
          enumer.visit({Type: 'Folder'});
          if (!enumer.canDescend()) return;
          for (const appId of this.appMap.keys()) {
            const subEntry = this.getEntry(`/${encodeURIComponent(appId)}`);
            enumer.descend(appId);
            enumer.visit(subEntry.get());
            enumer.ascend();
          }
        },
      };
    }

    const path = PathFragment.parse(rawPath);
    if (path.parts.length > 1) return null;

    const appId = decodeURIComponent(path.parts.shift());
    const appInfo = this.appMap.get(appId);
    if (!appInfo) return null;

    const data = {
      version: 'v1beta1',
      metadata: appInfo.metadata,
      roots: appInfo.roots.map(exportNode),
    };

    return {
      get() {
        return {
          Type: 'Blob',
          Mime: 'application/json; charset=utf-8', // clients use charset to know it's text
          Data: btoa(JSON.stringify(data)),
        };
      },
    };
  }
}

function exportNode(input) {
  return {
    ...input,
    names: input.names?.constructor === Map
      ? Array.from(input.names).map(x => [x[0], exportNode(x[1])])
      : undefined,
    inner: input.inner
      ? exportNode(input.inner)
      : undefined,
  };
}

exports.SchemaDevice = SchemaDevice;
