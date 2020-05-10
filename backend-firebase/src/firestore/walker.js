const frames = require('./walker-frames.js');

class FirestoreRegionWalker {
  constructor(rootOpts) {
    const rootFrame = new frames.RootFrame(rootOpts);

    // this.appId = appId;
    // this.regionId = regionId;

    this.stack = new Array;
    this.current = rootFrame;

    // console.log('hello', rootRef.path, appId, regionId, rootPaths)


    // this.stack = new Array;
    // this.current = new FirestoreRegionFrame({
    //
    //   paths: rootPaths,
    // });
  }

  pushFrame(frame) {
    this.stack.push(this.current);
    this.current = frame;
  }
  popFrame() {
    const copy = this.current;
    this.current = this.stack.pop();
    return copy;
  }

  walkPath(path) {
    console.log('walking', path);

    const newStack = this.stack.slice();
    let currFrame = this.current;
    while (path.count() > 0) {
      const {nextFrame, remainingPath} = currFrame.selectPath(path);
      if (nextFrame) {
        newStack.push(currFrame);
        currFrame = nextFrame;
        path = remainingPath;
      } else {
        return false;
      }
    }
    this.stack = newStack;
    this.current = currFrame;
    return true;
  }

  // getCurrEntry() {
  //   return new FirestoreRegionEntry(regionWalker);
  // }

  getEntryApi() {
    const walker = this;
    return {
      async enumerate(enumer) {
        switch (true) {

          // things that have children
          case walker.current instanceof frames.CollectionFrame:
          case walker.current instanceof frames.DocumentFrame:
            // console.log('enum', walker.current)
            enumer.visit({Type: 'Folder'});
            if (enumer.canDescend()) {
              for (const subFrame of await walker.current.getChildFrames()) {
                walker.pushFrame(subFrame);
                enumer.descend(subFrame.treeName);
                await this.enumerate(enumer);
                enumer.ascend();
                walker.popFrame();
              }
            }
            break;

          default:
            enumer.visit({Type: 'Error', StringValue: `TODO: enum non-collection node`})
        }
      },
    };
  }
}

exports.FirestoreRegionWalker = FirestoreRegionWalker;
