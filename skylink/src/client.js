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

  /////////////////////////////
  // Public API

  attach(extension) {
    extension.attachTo(this);
  }

  handleShutdown(input) {
    for (const handler of this.shutdownHandlers) {
      handler(input);
    }
  }

  // Issues a request frame to the server and returns the result frame
  // No checks are done on the status of the result frame itself,
  //   but if we fail to obtain a result, that will be thrown properly
  async volley(request) {
    throw new Error(`#TODO: impl volley() to do something lol`);
  }

  /////////////////////////////
  // Protected API for implementers

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
