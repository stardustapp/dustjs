class Orbiter {
  constructor() {
    this.metadata = {};
    this.endpoint = '';
    this.path = '';

    this.launcher = null;
    this.skylink = null;
    this.status = 'Idle';
  }

  autoLaunch() {
    this.status = 'Launching';
    this.launcher = Launchpad.forCurrentUserApp();
    return this.launcher.discover()
      .then(data => {
        this.metadata = data;
        return this.launcher.launch(this.launcher.storedSecret);
      })
      .catch(err => {
        this.status = 'Failed: ' + x.StringValue;
        var pass = prompt(x.StringValue + `\n\nInput a secret:`);
        if (pass) {
          return this.launcher.launch(pass);
        }
        return err;
      })
      .then(path => {
        return this.launch(this.launcher.endpoint, path);
      });
  }

  launch(endpoint, path) {
    console.log('Orbiter launched, at', path);
    this.status = 'Ready';
    this.skylink = new Skylink(path, endpoint);

  }
}