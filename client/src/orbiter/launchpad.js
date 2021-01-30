import {Skylink} from '../skylink/client.js';

export class BaseLaunchpad {
  constructor(domainName, appId, assumeUser, subdomain) {
    this.domainName = domainName;
    this.appId = appId;
    this.assumeUser = assumeUser;
    this.subdomain = subdomain || '';

    this.status = 'Idle';
    this.skychart = new Skylink('', this.generateEndpoint('http'));

    console.log('Configuring', this.constructor.name, 'for app', appId);
  }

  generateEndpoint(baseScheme, localport=':9231') {
    // Autoconfigure endpoint, defaulting to TLS
    // Allow downgrades to insecure where real certs don't go:
    //   localhost, LAN, and IPs
    let protocol = baseScheme+'s';
    let domainName = `${this.subdomain}${this.domainName}`;
    if (this.domainName.match(/^(localhost|[^.]+.(?:lan|local)|(?:\d{1,3}\.)+\d{1,3})(?::(\d+))?$/)) {
      if (location.protocol === 'http:') {
        protocol = baseScheme;
      }
      domainName = `${this.domainName}${localport}`;
    }

    let path = '/~~export';
    if (baseScheme === 'ws') {
      path += `/ws`;
    }

    return `${protocol}://${domainName}${path}`;
  }
}

export class FirebaseLaunchpad extends BaseLaunchpad {
  constructor(domainName, appId, assumeUser, subdomain) {
    super(domainName, appId, assumeUser, subdomain);
  }

  static forCurrentUserApp() {
    // Discover appId from app's HTML document
    const appIdMeta = document.querySelector('meta[name=x-stardust-appid]');
    if (!(appIdMeta && appIdMeta.content)) {
      throw new Error('add <meta name=x-stardust-appid ...> tag');
    }
    const appId = appIdMeta.content;

    const assumeUserMeta = document
      .querySelector('meta[name=x-stardust-assume-user]');
    const urlArgs = new URLSearchParams(document.location.search);
    const assumeUser = urlArgs.get('assumeUser')
      ?? assumeUserMeta?.content
      ?? false;

    // TODO
    const subdomain = 'starSubdomain' in window ? window.starSubdomain : 'api.';

    return new FirebaseLaunchpad(localStorage.domainName || location.hostname, appId, assumeUser, subdomain);
  }

  async discover() {
    // await domLoaded;
    this.status = 'Waiting for login';
    this.user = await new Promise(resolve => {
      firebase.auth().onAuthStateChanged(user => {
        if (user) resolve(user);
      });
    });
    this.status = 'Located';

    this.metadata = {
      ownerName: this.user.displayName,
      ownerEmail: this.user.email,
      homeDomain: 'localhost',
    };

    return this.metadata;
  }

  async invokeLaunchToPath(path, transport, ticket) {
    const result = await this.skychart.invoke(path,
      Skylink.toEntry('ticket', ticket));

    if (result.Name === 'error') {
      return Promise.reject(result.StringValue);
    } else if (transport === 'ws') {
      this.status = 'Done';
      return '/pub/sessions/' + result.StringValue + '/mnt';
    } else {
      this.status = 'Done';
      return '/sessions/' + result.StringValue + '/mnt';
    }
  }

  async launch(unused, transport) {
    try {

      if (this.assumeUser) {
        const userPath = await this
          .invokeLaunchToPath('/idtoken-launch/invoke', 'http', {
            'ID Token': await this.user.getIdToken(),
            'App ID': this.appId,
          });
        const assumedPath = await this
          .invokeLaunchToPath(userPath+'/assume-user/invoke', transport, {
            'User ID': this.assumeUser,
            'App ID': this.appId,
          });
        this.status = 'Done';
        return assumedPath;
      }

      const userPath = await this
        .invokeLaunchToPath('/idtoken-launch/invoke', transport, {
          'ID Token': await this.user.getIdToken(),
          'App ID': this.appId,
        });
      this.status = 'Done';
      return userPath;

    } finally {
      this.status = 'Located';
    }
  }
}

// original class for old servers
export class LegacyChartLaunchpad extends BaseLaunchpad {
  constructor(domainName, chartName, appId, assumeUser) {
    super(domain, appId, assumeUser);
    this.chartName = chartName;
  }

  static forCurrentUserApp() {
    //console.info('Autoconfiguring orbiter for the current context...');

    // Discover appId from app's HTML document
    const appIdMeta = document.querySelector('meta[name=x-stardust-appid]');
    if (!(appIdMeta && appIdMeta.content)) {
      throw new Error('add <meta name=x-stardust-appid ...> tag');
    }
    const appId = appIdMeta.content;

    const assumeUserMeta = document
      .querySelector('meta[name=x-stardust-assume-user]');
    const assumeUser = assumeUserMeta && assumeUserMeta.content || false;

    // Discover chartName from current URL
    if (location.pathname.startsWith('/~~')) {
      throw new Error("Core routes don't have a chart");
    } else if (!location.pathname.startsWith('/~')) {
      throw new Error("Unscoped routes don't have a chart");
    }
    const chartName = location.pathname.split('/')[1].slice(1);

    return new LegacyChartLaunchpad(localStorage.domainName || location.hostname, chartName, appId, assumeUser);
  }

  // Discover saved secret from localStorage, if any
  get storedSecret() {
    if (this.providedSecret) {
      return this.providedSecret;
    }
    const secretKey = `skychart.${this.chartName}.secret`;
    if (window.localStorage && window.localStorage[secretKey]) {
      //console.info('Retrieving local secret for', this.chartName);
      return window.localStorage[secretKey];
    }
    //console.log('No known secret stored, returning nil');
    return null; // no secret is known
  }

  // Store the given secret to localStorage, or set falsey to clear
  set storedSecret(secret) {
    console.info('Storing', secret.length, 'character secret for', this.chartName);
    const secretKey = `skychart.${this.chartName}.secret`;
    window.localStorage[secretKey] = secret || '';
  }

  // Connects to a control-plane skylink for chart APIs
  // Returns a metadata object
  // Enables launch() function which, only succeeds once per Launchpad.
  discover() {
    if (this.status != 'Idle') {
      throw new Error(`Launchpad was in status ${this.status}, not ready to discover`);
    }
    this.status = 'Discovering';

    return this.skychart
      .invoke('/pub/open/invoke', Skylink.String('', this.chartName), '/tmp/chart')
      .then(() => {
        this.status = 'Reading';
        const meta = {};
        const p1 = this.skychart
          .loadString('/tmp/chart/owner-name')
          .then(x => meta.ownerName = x);
        const p2 = this.skychart
          .loadString('/tmp/chart/owner-email')
          .then(x => meta.ownerEmail = x);
        const p3 = this.skychart
          .loadString('/tmp/chart/home-domain')
          .then(x => meta.homeDomain = x);
        return Promise.all([p1, p2, p3])
          .then(() => {
            this.metadata = meta;
            this.status = 'Located';
            return meta;
          });
      });
  }

  // Attempt to launch an orbiter
  launch(secretString) {
    if (this.status != 'Located') {
      throw new Error(`Launchpad was in status ${this.status}, not ready to launch`);
    }
    this.status = 'Launching';

    var secret = null;
    if (secretString) {
      secret = Skylink.String('secret', secretString);
    }

    return this.skychart
      .invoke('/tmp/chart/launch/invoke', secret)
      .then(x => {
        if (x.Name === 'error') {
          this.status = 'Located';
          return Promise.reject(x.StringValue);
        } else {
          // this.skychart.stopTransport();
          this.status = 'Done';
          return '/pub/sessions/' + x.StringValue + '/mnt';
        }
      });
  }
}
