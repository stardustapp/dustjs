class SkylinkServer {
  constructor(env) {
    this.env = env;
    this.ops = new Map(SKYLINK_CORE_OPS);

    // event handlers
    this.outputEncoders = new Array;
    this.shutdownHandlers = new Array;
  }

  attach(extension) {
    extension.attachTo(this);
  }

  encodeOutput(output) {
    // let extensions provide custom framing
    for (const encoder of this.outputEncoders) {
      const frame = encoder(output);
      if (frame) return frame;
    }

    // build a default frame
    return {
      Ok: true,
      Output: output,
    };
  }

  handleShutdown(input) {
    for (const handler of this.shutdownHandlers) {
      handler(input);
    }
  }

  // Called by transports when the client sends an operation
  // Promises a frame back
  processFrame(request) {
    const startTime = new Date;

    const keys = Object.keys(request);
    if (keys.some(k => k[0] > '`')) { // HACK: checks for lowercase letters
      console.warn('Received Skylink frame with bad key casing, fixing it');
      const newReq = {};
      keys.forEach(key => {
        newReq[key[0].toUpperCase()+key.slice(1)] = request[key];
      });
      request = newReq;
    }

    return this
      .performOperation(request)
      // wrap output into a response
      .then(this.encodeOutput.bind(this), err => {
        console.warn('!!! Operation failed with', err);
        return {
          Ok: false,
          Output: {
            Type: 'String',
            Name: 'error-message',
            StringValue: err.message,
          },
        };
      })
      // observe and pass response
      .then(response => {
        const endTime = new Date;
        const elapsedMs = endTime - startTime;

        const {Op} = request;
        const {Ok} = response;
        //Datadog.Instance.count('skylink.op.invocation', 1, {Op, Ok});
        //Datadog.Instance.gauge('skylink.op.elapsed_ms', elapsedMs, {Op, Ok});

        return response;
      });
  }

  // Returns the 'Output' of an operation if Ok. Doesn't give a packet envelope!
  async performOperation(request) {
    console.debug('--> inbound operation:', request.Op, request.Path, request.Dest);
    if (this.ops.has(request.Op)) {
      return this.ops.get(request.Op).call(this, request);
    } else {
      throw new Error(`Server doesn't implement ${request.Op} operation`);
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    SkylinkServer,
  };
}
