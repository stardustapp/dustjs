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

  // Like volley(), except it checks the response and returns Output directly
  /*async*/ performOp(request) {
    return this.volley(request).then(response => {
      switch (response.Ok) {
        case true:
          return response.Output;
        case false:
          const failErr = new Error(this.makeRejectionMessage(request, output));
          failErr.response = response;
          return Promise.reject(failErr);
        default:
          console.log('ERR: Bad server response, missing "Ok":', response);
          const err = new Error(`BUG: Skylink server response didn't have 'Ok'`);
          err.response = response;
          return Promise.reject(err);
      }
    });
  }

  /////////////////////////////
  // Protected API for implementers

  makeRejectionMessage(request, output) {
    const outputType = output ? output.Type : 'None';
    let errorMessage = `"${request.Op}" operation wasn't Ok`;
    switch (outputType) {
      case 'String':
        return `${errorMessage}: ${output.StringValue}`;
      case 'Error':
        console.error(`TODO: decode wire Error output:`, output);
        return `${errorMessage}: ${output.StringValue}`;
      case 'None':
        return `${errorMessage}, and no error was returned!`;
      default:
        return `${errorMessage}, and returned odd output type "${outputType}"`;
    }
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
