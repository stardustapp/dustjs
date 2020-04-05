module.exports = {
  // inmemory constructs
  ...require('./platform-api.js'),
  ...require('./temp-device.js'),

  // system I/O
  ...require('./filesystem-device.js'),
  ...require('./skylink-client-device.js'),
};
