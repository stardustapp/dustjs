class Orbiter {
  constructor() {
    this.metadata = {};
    this.endpoint = '';
    this.path = '';

    this.launcher = null;
    this.skylink = null;
    this.mountTable = null;
    this.status = 'Idle';

    this.stats = {
      ops: 0,
      chans: 0,
      pkts: 0,
      fails: 0,
    };
  }

  autoLaunch(launcher) {
    if (!launcher) {
      launcher = Launchpad.forCurrentUserApp();
    }
    this.launcher = launcher;
    this.status = 'Launching';

    const {chartName, domainName, appId} = this.launcher;
    const baseUri = `skylink://${chartName}@${domainName}/~${appId}`;
    this.mountTable = new MountTable(baseUri, x => this.status = x);

    return this.launcher.discover()
      .then(data => {
        this.metadata = data;
        return this.launcher.launch(this.launcher.storedSecret);
      })
      .catch(err => {
        this.status = 'Failed: ' + err;
        var pass = prompt(`${err}\n\nInput a secret:`);
        if (pass) {
          return this.launcher.launch(pass);
        }
        throw err;
      })
      .then(path => {
        // TODO: mount to /srv
        this.mountTable.mount('', 'skylink', {
          endpoint: this.launcher.endpoint,
          path: path,
          stats: this.stats,
        });

        // TODO: remove when nothing uses orbiter#skylink
        // TODO: should be mounted to /srv
        this.skylink = this.mountTable.mounts.get('').skylink;

        //return this.launch(this.launcher.endpoint, path);
      });
  }

  /*
  launch(endpoint, path) {
    console.log('Orbiter launched, at', path);
    this.status = 'Ready';
    this.mounttable.mount({path: '/srv', skylink: this.skylink});

    this.skylink = new Skylink(path, endpoint);
    this.skylink.stats = this.stats;
    this.skylink.transport.donePromise.then(() => {
      this.status = 'Offline';
    }, (err) => {
      this.status = 'Crashed';
      throw err;
    });
  }*/
}

if (typeof module !== "undefined" && module !== null) {
  module.exports = Orbiter;
}