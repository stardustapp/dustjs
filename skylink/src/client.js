class SkylinkClient {
  constructor() {
    // extension points
    this.outputDecoders = new Array;
    this.frameProcessors = new Array;
    this.shutdownHandlers = new Array;
  }

  attach(extension) {
    extension.attachTo(this);
  }

  decodeOutput(frame) {
    // let extensions decode custom framing
    for (const decoder of this.outputDecoders) {
      const result = decoder(output);
      if (result) return result;
    }

    // default to no transform
    return output;
  }

  handleShutdown(input) {
    for (const handler of this.shutdownHandlers) {
      handler(input);
    }
  }

  // TODO: by default, calls sendFrame() and queues for a receiveFrame() call
  // please either extend and replace, or integrate those two funcs so this impl works
  async volley(request) {
    throw new Error(`#TODO: impl volley() to do something lol`);
  }

  receiveFrame(frame) {
    // let extensions override the whole frame
    for (const processor of this.frameProcessors) {
      const result = processor(frame);
      if (result) return;
    }

    // fallback to impl default
    this.processFrame(frame);
  }
}

module.exports = {
  SkylinkClient,
};
