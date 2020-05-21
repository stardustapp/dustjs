import {
  InflateSkylinkLiteral, DeflateToSkylinkLiteral,
} from './api/entries/index.js';

export class SkylinkClient {
  constructor() {
    // extension points
    this.outputDecoders = new Array;
    this.frameProcessors = new Array;
    this.shutdownHandlers = new Array;
    this.extraInflaters = new Map;
    this.extraDeflaters = new Map;
  }

  attach(extension) {
    extension.attachTo(this);
  }

  encodeFrame(frame) {
    return JSON.stringify({ ...frame,
      Input: DeflateToSkylinkLiteral(frame.Input, this.extraDeflaters),
    });
  }

  decodeOutput(frame) {
    // let extensions decode custom framing entirely
    // used for channels
    for (const decoder of this.outputDecoders) {
      const result = decoder(frame);
      if (result) return {
        ...frame,
        Output: result,
      };
    }

    // default to just simple transforms
    // used for strings, folders, plus extras
    return { ...frame,
      Output: InflateSkylinkLiteral(frame.Output, this.extraInflaters),
    };
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

    // fallback to just decoding the Output
    this.processFrame(this.decodeOutput(frame));
  }
}
