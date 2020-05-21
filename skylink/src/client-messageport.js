import {SkylinkClient} from './client.js';

// Used for WebWorkers and such
// You pass received frames to receiveFrame() and impl sendFrame()
// Your eventObj should have postMessage(data) and call its onmessage(evt)
// IDs are attached to each message, so it's not lockstep
// You can have a Client & Server on both sides via the Reversal extension

export class MessagePassingSkylinkClient extends SkylinkClient {
  constructor(eventObj) {
    super();

    // wire our send and receive to the given I/O interface
    this.postMessage = eventObj.postMessage.bind(eventObj);
    eventObj.onmessage = this.processMessageEvent.bind(this);

    this.pendingIds = new Map;
    this.nextId = 1;
  }

  async volley(request) {
    request.Id = this.nextId++;

    // send request and await response
    const response = await new Promise(resolve => {
      this.pendingIds.set(request.Id, {request, resolve});
      this.postMessage(request);
    });
    return response;
  }

  processMessageEvent(evt) {
    // Attach the passed port, if any
    if (evt.ports.length)
      evt.data._port = evt.ports[0];
    else if ('_port' in evt.data)
      throw new Error(`BUG: _port was already present on passed message`);

    // Submit for processing
    this.receiveFrame(evt.data);
  }

  processFrame(frame) {
    const {Id} = frame;

    if (this.pendingIds.has(Id)) {
      const future = this.pendingIds.get(Id);
      this.pendingIds.delete(Id);
      future.resolve(frame);

    } else {
      throw new Error(`BUG: skylink message-passer got message for non-pending thing`);
    }
  }
}
