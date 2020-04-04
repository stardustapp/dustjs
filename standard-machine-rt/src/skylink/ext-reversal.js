// Lets a SkylinkClient process server-sent operations inband via a SkylinkServer
// Effectively gives you get full-duplex request/response
// Setting up bidirectional inband channels via reversal isn't tested but it might work lol
// Implemented by checking for 'Op' presence on each frame and redirecting those frames to the given 'server' for handling
class SkylinkReversalExtension {
  constructor(server) {
    this.server = server;
  }

  attachTo(skylink) {
    this.client = skylink;
    if (!this.client.postMessage) throw new Error(`Only clients with direct postMessage access can use reversal`)
    skylink.frameProcessors.push(this.processFrame.bind(this));
  }

  processFrame(frame) {
    if (!('Op' in frame)) return;

    return this.server
      .processFrame(frame)
      .then(response => {
        if ('Id' in frame)
          response.Id = frame.Id;
        this.client.postMessage(response);
      });
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    SkylinkReversalExtension,
  };
}
