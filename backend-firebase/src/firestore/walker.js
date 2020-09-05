const frames = require('./frames/');
const {PublicationState} = require('./publication-state.js');
const {ReferenceTracker} = require('./references.js');

class FirestoreRegionWalker {
  constructor(rootName, rootSpec, rootConfig) {
    this.tracker = new ReferenceTracker();
    const rootFrame = new frames.AppRegionFrame(rootName, rootSpec, {
      ...rootConfig,
      tracker: this.tracker,
    });

    this.stack = new Array;
    this.current = rootFrame;
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
    for (const name of path.names) {
      if (typeof currFrame.selectName !== 'function') throw new Error(
        `BUG: ${currFrame.constructor.name} missing selectName`);
      const nextFrame = currFrame.selectName(name);
      // console.log(path, name, nextFrame);
      if (nextFrame) {
        newStack.push(currFrame);
        currFrame = nextFrame;
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
        if (typeof walker.current.getLiteral === 'function') {
          return await walker.current.getLiteral();
        } else return {
          Type: 'Error',
          StringValue: `TODO: get node "${walker.current.constructor.name}"`,
        };
      },

      async put(input) {
        if (typeof walker.current.putLiteral === 'function') {
          await walker.current.putLiteral(input);
          await walker.tracker.commitChanges();
        } else throw new Error(
          `TODO: put node "${walker.current.constructor.name}"`);
      },

      async invoke(input) {
        // we actually walk up one frame because funcs have an unary name
        if (walker.stack.length < 1) throw new Error(
          `Cannot invoke the walker root`);
        const funcFrame = walker.current;
        try {
          walker.popFrame();
          const targetFunc = `invoke_${funcFrame.name}`;

          if (typeof walker.current[targetFunc] === 'function') {
            const result = await walker.current[targetFunc](input, walker);
            await walker.tracker.commitChanges();
            return result;
          } else throw new Error(
            `Cannot invoke "${funcFrame.name}" on "${walker.current.name}"`);
        } finally {
          walker.pushFrame(funcFrame);
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
