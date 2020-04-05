module.exports = {
  ...require('./api/'),
  ...require('./devices/'),
  ...require('./extensions/'),

  ...require('./client.js'),
  ...require('./client-http.js'),
  ...require('./client-messageport.js'),
  ...require('./client-websocket.js'),
  ...require('./core-ops.js'),
  ...require('./server.js'),
};
