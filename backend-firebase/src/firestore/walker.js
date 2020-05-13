const frames = require('./walker-frames.js');
const {PublicationState} = require('./publication-state.js');

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
    // console.log('walking', path);

    const newStack = this.stack.slice();
    let currFrame = this.current;
    while (path.count() > 0) {
      if (typeof currFrame.selectPath !== 'function') throw new Error(
        `BUG: ${currFrame.constructor.name} missing selectPath`);
      const {nextFrame, remainingPath} = currFrame.selectPath(path);
      // console.log(path, nextFrame, remainingPath);
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

      async get() {
        switch (true) {

          case typeof walker.current.getLiteral === 'function':
            return await walker.current.getLiteral();
            break;

          default:
            return {Type: 'Error', StringValue: `TODO: get non-collection node "${walker.current.constructor.name}"`};
        }
      },

      async enumerate(enumer) {
        switch (true) {

          // things that have children
          case typeof walker.current.getChildFrames === 'function':
            // console.log('enum', walker.current)
            enumer.visit({Type: 'Folder'});
            if (enumer.canDescend()) {
              for (const subFrame of await walker.current.getChildFrames()) {
                walker.pushFrame(subFrame);
                enumer.descend(subFrame.name);
                await this.enumerate(enumer);
                enumer.ascend();
                walker.popFrame();
              }
            }
            break;

          case typeof walker.current.getLiteral === 'function':
            const literal = await walker.current.getLiteral();
            if (literal) enumer.visit(literal);
            break;

          default:
            enumer.visit({Type: 'Error', StringValue: `TODO: enum non-collection node "${walker.current.constructor.name}"`})
        }
      },

      subscribe(Depth, newChannel) {
        if (typeof walker.current.startSubscription === 'function') {
          return newChannel.invoke(async c => {
            const state = new PublicationState(c);
            // TODO: check Depth
            c.onStop(walker.current.startSubscription(state, Depth));
          });
        } else throw new Error(
          `TODO: sub node "${walker.current.constructor.name}"`);
      },

    };
  }
}

exports.FirestoreRegionWalker = FirestoreRegionWalker;
