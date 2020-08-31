import * as launchpads from './launchpad.js';
import {MountTable} from './mount-table.js';

export class Orbiter {
  constructor(flavor='legacy') {
    this.metadata = {};
    this.path = '';
    this.flavor = flavor;

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
    this.launcher = launcher;
    this.status = 'Launching';
    if (!this.launcher) {
      if (this.flavor === 'firebase') {
        this.launcher = launchpads.FirebaseLaunchpad.forCurrentUserApp();
        const {domainName, appId} = this.launcher;
        const baseUri = `skylink://${domainName}/~${appId}`;
        this.mountTable = new MountTable(baseUri, x => this.status = x);
      } else {
        this.launcher = launchpads.LegacyChartLaunchpad.forCurrentUserApp();
        const {chartName, domainName, appId} = this.launcher;
        const baseUri = `skylink://${chartName}@${domainName}/~${appId}`;
        this.mountTable = new MountTable(baseUri, x => this.status = x);
      }
    }

    // TODO
    const transport = 'starTransport' in window ? window.starTransport : 'ws';

    console.log('launcher', this.launcher);
    return this.launcher.discover()
      .then(data => {
        this.metadata = data;
        return this.launcher.launch(this.launcher.storedSecret, transport);
      })
      .catch(err => {
        this.status = 'Failed: ' + err;
        if (`${err}`.includes('secret')) {
          var pass = typeof prompt === 'function' && prompt(`${err}\n\nInput a secret:`);
          if (pass) {
            return this.launcher.launch(pass);
          }
        }
        throw err;
      })
      .then(path => {

        // TODO: mount to /srv
        this.mountTable.mount('', 'skylink', {
          endpoint: this.launcher.generateEndpoint(transport),
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
