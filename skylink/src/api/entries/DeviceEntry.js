// Used to represent raw devices being passed around within a process
// Not network transparent!

class DeviceEntry {
  constructor(name, device) {
    this.Name = name;
    this.Type = 'Device';

    Object.defineProperty(this, '_device', {
      value: device,
    })
  }

  getEntry(path) {
    return this._device.getEntry(path);
  }

  inspect() {
    return `<Device ${JSON.stringify(this.Name)} impl=${this._device.constructor.name}>`;
  }
}
exports.DeviceEntry = DeviceEntry;
