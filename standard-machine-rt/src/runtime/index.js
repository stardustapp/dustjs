global.ExportAll = obj => {
  for (const key in obj) {
    global[key] = obj[key];
  }
};
ExportAll(require('./utils/async-cache.js'));
ExportAll(require('./utils/errors.js'));
ExportAll(require('./utils/random.js'));
ExportAll(require('./utils/exec.js'));
ExportAll(require('./model.js'));

// TODO: create immutable objects
const pkgMeta = require('../package.json');
const userAgent = `Stardust ${pkgMeta.name}/${pkgMeta.version}`;
global.navigator = {userAgent};
global.crypto = require('crypto');
global.fetch = require('node-fetch');
global.moment = require('moment');
global.commonTags = require('common-tags');

module.exports = {
  ...require('./loader.js'),
  ...require('./machine.js'),
};
