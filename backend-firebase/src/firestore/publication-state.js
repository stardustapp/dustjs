const {FolderEntry, StringEntry} = require('@dustjs/skylink');

class PublicationState {
  constructor(chanApi) {
    this.chanApi = chanApi;
    this.sentPaths = new Map;
    this.isReady = false;
  }
  markCrashed(err) {
    this.chanApi.error(new FolderEntry('error', [
      new StringEntry('type', 'Error'),
      new StringEntry('message', err.message),
      new StringEntry('name', err.name),
    ]));
    this.chanApi = null;
  }
  markDone() {
    this.chanApi.done();
    this.chanApi = null;
  }
  markReady() {
    if (this.isReady) return;
    this.chanApi.next(new FolderEntry('notif', [
      new StringEntry('type', 'Ready'),
    ]));
    this.isReady = true;
  }
  removePath(path) {
    const exists = this.sentPaths.has(path);
    if (!exists) return;
    // throw new Error(`TODO: walk sentPaths to remove all children of ${path}`);
    this.chanApi.next(new FolderEntry('notif', [
      new StringEntry('type', 'Removed'),
      new StringEntry('path', path),
    ]));
    this.sentPaths.delete(path);

    // walk what we've sent looking for any children, to remove
    const childPathPrefix = path ? `${path}/` : ``;
    for (const [knownPath] of this.sentPaths) {
      if (path !== knownPath && knownPath.startsWith(childPathPrefix)) {
        // TODO: do we actually need to transmit child removals? clients can assume them
        this.chanApi.next(new FolderEntry('notif', [
          new StringEntry('type', 'Removed'),
          new StringEntry('path', knownPath),
        ]));
        this.sentPaths.delete(knownPath);
      }
    }
  }
  offerPath(path, newEntry) {
    const exists = this.sentPaths.has(path);
    if (!newEntry) throw new Error(
      `BUG: offerPath() cannot accept null entries`);

    const entry = {...JSON.parse(JSON.stringify(newEntry)), Name: 'entry'};
    if (typeof entry.Type !== 'string') throw new Error(
      `BUG: tried to offerPath() something without a Type string`);

    if (exists) {
      const prevEntry = this.sentPaths.get(path);
      if (prevEntry.Type !== entry.Type) throw new Error(
        `TODO: offerPath() given a ${entry.Type} for '${path}' was previously ${prevEntry.Type}`);

      switch (entry.Type) {
        case 'String':
          // simple comparision
          if (entry.StringValue === prevEntry.StringValue) return;
          break;

        case 'Error':
          if ([
            entry.StringValue === prevEntry.StringValue,
            entry.Authority === prevEntry.Authority,
            entry.Code === prevEntry.Code,
          ].includes(false) === false) return;
          break;

        case 'Blob':
          if ([
            entry.Mime === prevEntry.Mime,
            entry.Data === prevEntry.Data,
          ].includes(false) === false) return;
          break;

        case 'Folder':
          // allow for listing Children here as a convenience method
          if ('Children' in entry) {
            const childMap = new Map;
            for (const child of entry.Children) {
              childMap.set(child.Name, child);
            }
            this.offerPathChildren(path, childMap);
          }
          // folders don't have their own attrs, so never get Changed
          return;

        default:
          console.log('prev:', JSON.stringify(prevEntry, null, 2));
          console.log('next:', JSON.stringify(entry, null, 2));
          throw new Error(`TODO: offerPath() diffing for ${entry.Type}`);
      }
    }

    this.chanApi.next(new FolderEntry('notif', [
      new StringEntry('type', exists ? 'Changed' : 'Added'),
      new StringEntry('path', path),
      entry,
    ]));
    this.sentPaths.set(path, entry);

    if (entry.Type === 'Folder' && 'Children' in entry) {
      const childMap = new Map;
      for (const child of entry.Children) {
        childMap.set(child.Name, child);
      }
      this.offerPathChildren(path, childMap);
    }
  }

  offerPathChildren(parentPath, childMap) {
    const childNamePrefix = parentPath ? `${parentPath}/` : ``;
    if (childMap.constructor !== Map) throw new Error(
      `BUG: offerPathChildren() requires a Map instance`);

    const expectedNames = new Set;
    for (const [knownPath] of this.sentPaths) {
      // make sure they're exactly one level underneath
      if (!knownPath.startsWith(childNamePrefix)) continue;
      const name = knownPath.slice(childNamePrefix.length);
      if (name.indexOf('/') !== -1 || name === '') continue;
      expectedNames.add(decodeURIComponent(name));
    }

    for (const [name, entry] of childMap) {
      // console.log('seen', name);
      expectedNames.delete(name);
      this.offerPath(childNamePrefix+encodeURIComponent(name), entry);
    }

    // console.log('offerPathChildren ended up with stragglers:', expectedNames);
    for (const lostName of expectedNames) {
      console.debug(`offerPathChildren retracting straggler:`, childNamePrefix, lostName);
      this.removePath(childNamePrefix+encodeURIComponent(lostName));
    }
  }
}
exports.PublicationState = PublicationState;
