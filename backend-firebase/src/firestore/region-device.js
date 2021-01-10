const {PathFragment} = require('@dustjs/skylink');

const {AppRegionFrame} = require('./frames/index.js');
const {FirestoreWalker} = require('./walker.js');
const {ReferenceTracker} = require('./references.js');

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
          for (const [appId, appInfo] of this.userSession.appMap) {
            const appRegion = appInfo.getAppRegion(this.region);
            if (!appRegion) continue;

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
        },
      };
    }

    const path = PathFragment.parse(rawPath);
    const appId = decodeURIComponent(path.parts.shift());
    const appInfo = this.userSession.appMap.get(appId);
    if (!appInfo) {
      return null;
    }

    const appRegion = appInfo.getAppRegion(this.region);
    // console.log(appId, this.region, path, appRegion);
    if (!appRegion) {
      return null;
    }

    const tracker = new ReferenceTracker();
    const rootFrame = new AppRegionFrame(appId, appRegion, {
      rootRef: this.userSession.userRef,
      appId: appId,
      regionId: this.region,
      tracker,
    });

    const regionWalker = new FirestoreWalker(tracker, rootFrame);
    if (regionWalker.walkPath(path)) {
      return regionWalker.getEntryApi();
    } else {
      return null;
    }
  }
}

exports.FirestoreRegionDevice = FirestoreRegionDevice;
