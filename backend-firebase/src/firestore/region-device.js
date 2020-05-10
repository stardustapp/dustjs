const {Environment, PathFragment} = require('@dustjs/skylink');

const {FirestoreRegionWalker} = require('./walker.js');

class FirestoreRegionDevice {
  constructor(userSession, region) {
    this.userSession = userSession;
    this.region = region;
  }
  getEntry(rawPath) {
    if (rawPath.length <= 1) {
      return {
        enumerate: async enumer => {
          enumer.visit({Type: 'Folder'});
          if (!enumer.canDescend()) return;
          for (const [appId, regions] of this.userSession.appMap) {
            if (regions.has(this.region)) {
              enumer.descend(appId);
              if (enumer.canDescend()) {
                // throw new Error(`TODO: enumerate into app region`)
                const subEntry = this.getEntry(`/${encodeURIComponent(appId)}`);
                await subEntry.enumerate(enumer);
              } else {
                enumer.visit({Type: 'Folder'});
              }
              enumer.ascend();
            }
          }
        },
      };
    }

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
