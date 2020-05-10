const {Environment, PathFragment} = require('@dustjs/skylink');
const {FirestoreDocument} = require('./document.js');

// function pathToField(path) {
//   return path.slice(1)
//     .replace(/-[a-z]/g, s=>s.slice(1).toUpperCase())
//     .replace(/\//g, '.');
// }
//
// function fieldToTreeName(field) {
//   return field.replace(/[A-Z]/g, s=>'-'+s.toLowerCase());
// }

const {FirestoreRegionWalker} = require('./walker.js');

class FirestoreRegionDevice {
  constructor(userSession, region) {
    this.userSession = userSession;
    this.region = region;
  }
  getEntry(rawPath) {
    const path = PathFragment.parse(rawPath);
    const appId = decodeURIComponent(path.parts.shift());

    const appRegion = this.userSession.appMap.get(appId).get(this.region);

    const regionWalker = new FirestoreRegionWalker({
      rootRef: this.userSession.userRef,
      appId: appId,
      regionId: this.region,
      rootPaths: appRegion,
    });
    if (regionWalker.walkPath(path)) {
      return regionWalker.getEntryApi();
    } else {
      return null;
    }


    // const rootFrame = new FirestoreRegionFrame({
    //   paths: appRegion,
    // });
    // for (const root of appRegion) {
    //   if (path.startsWith(root.path)) {
    //     const subPath = path.slice(root.path.split('/').length - 1);
    //     console.log(`TODO: get path`, subPath, `from`, root.node);
    //     return;
    //   }
    // }
    //
    // const tempEnv = new Environment;
    // for (const root of appRegion) {
    //   tempEnv.bind(root.path, new Environment);
    // }
    // return tempEnv.getEntry(rawPath);
  }
}

exports.FirestoreRegionDevice = FirestoreRegionDevice;
