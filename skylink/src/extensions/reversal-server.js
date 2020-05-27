import {SkylinkClient} from '../client.js';
import {InlineChannelClient} from './channel-client.js';
import {DeviceEntry} from '../api/entries/DeviceEntry.js';
import {SkylinkClientDevice} from '../devices/skylink-client-device.js';

export class ReversedSkylinkClient extends SkylinkClient {
  constructor(extensions=[]) {
    super();

    this.waitingReceivers = new Array;
    for (const extension of extensions) {
      this.attach(extension);
    }
  }

  attachTo(skylink) {
    this.server = skylink;
    if (!this.server.postMessage) throw new Error(
      `Only clients with direct postMessage access can use reversal`)

    // triggered for packets received from the real client
    skylink.frameProcessors.push(frame => {
      // skip normal client->server frames
      if ('Op' in frame || 'op' in frame) return;
      // intercept as if the frame was received from a server
      this.receiveFrame(frame);
      return true;
    });

    // when the real client sends a Device to our real server, mount it from our reversed client
    skylink.extraInflaters.set('Device', raw => {
      if (typeof raw.ReversalPrefix !== 'string') throw new Error(
        `TODO: only Devices with a ReversalPrefix can be sent over the wire`);
      return new DeviceEntry(raw.Name, new SkylinkClientDevice(this, raw.ReversalPrefix));
    });
  }

  volley(request) {
    return new Promise((resolve, reject) => {
      this.waitingReceivers.push({resolve, reject});
      this.server.postMessage(request);
    });
  }

  // triggered by real-client packets intended for us (via receiveFrame)
  processFrame(frame) {
    const receiver = this.waitingReceivers.shift();
    if (receiver) {
      return receiver.resolve(frame);
    } else {
      throw new Error(`skylink received skylink payload without receiver`);
    }
  }
}
