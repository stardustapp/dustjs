const fetch = require('node-fetch');
const os = require('os');

function listifyTags(obj={}) {
  return Object.keys(obj)
    .filter(key => obj[key] !== null)
    .map(key => `${key}:${obj[key]}`);
}

class PointArray extends Array {
  constructor(metric, tagList) {
    super();
    this.metric = metric;
    this.tagList = tagList;
  }
}

class Datadog {
  constructor(apiKey, hostName, globalTags) {
    this.apiKey = apiKey;
    this.hostName = hostName;
    this.globalTags = listifyTags(globalTags);

    this.apiRoot = 'https://api.datadoghq.com/api';
    this.flushPeriod = 20; // seconds
    this.gauges = new Map;
    this.rates = new Map;
    this.counts = new Map;

    if (this.apiKey) {
      this.flushTimer = setInterval(this.flushNow.bind(this),
        this.flushPeriod * 1000);
      if (this.flushTimer.unref) {
        this.flushTimer.unref();
        // TODO: trigger final flush at shutdown
      }
    } else {
      console.debug('WARN: DD_API_KEY not set, no metrics will be reported.');
    }
  }

  appendPoint(mapName, metric, value, tags) {
    if (!this.apiKey) return;
    const tagList = listifyTags(tags).sort();
    const key = JSON.stringify([metric, tagList]);

    const map = this[mapName];
    if (map.has(key)) {
      map.get(key).push(value);
    } else {
      const list = new PointArray(metric, tagList);
      map.set(key, list);
      list.push(value);
    }
  }

  doHTTP(apiPath, payload) {
    if (!this.apiKey) return Promise.resolve(false);
    return fetch(`${this.apiRoot}${apiPath}?api_key=${this.apiKey}`, {
      method: 'POST',
      mode: 'no-cors', // we won't get any info about how the request went
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(err => {
      // TODO: cache and retry the request
      // don't we only get this in nodejs? because no-cors
      console.log('Datadog request failed:', err.message);
      return err;
    });
  }

  gauge(metric, value, tags) {
    this.appendPoint('gauges', metric, value, tags);
  }
  rate(metric, value, tags) {
    this.appendPoint('rates', metric, value, tags);
  }
  count(metric, value, tags) {
    this.appendPoint('counts', metric, value, tags);
  }

  statusCheck(metric, status, message, tags) {
    return this.doHTTP('/v1/check_run', {
      check: metric,
      timestamp: Math.floor(+new Date() / 1000),
      message, status,
      host_name: this.hostName,
      tags: this.globalTags.concat(listifyTags(tags)),
    });
  }

  stop() {
    if (!this.flushTimer) throw new Error(`Can't stop, already stopped.`);
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  async flushNow() {
    // report metrics as the middle of the batch
    // TODO: why?
    // TODO: batching points into chunks of 20/40/60 seconds in production
    const batchDate = Math.floor(+new Date() / 1000) - Math.round(this.flushPeriod / 2);
    const series = [];

    for (const array of this.gauges.values()) {
      if (array.length < 1) continue;
      let mean = array.reduce((acc, cur) => acc + cur, 0) / array.length;
      let max = array.sort((a, b) => b - a)[0];

      series.push({
        metric: array.metric,
        type: 'gauge',
        points: [[batchDate, mean]],
        host: this.hostName,
        tags: this.globalTags.concat(array.tagList),
      });
      series.push({
        metric: array.metric+'.max',
        type: 'gauge',
        points: [[batchDate, max]],
        host: this.hostName,
        tags: this.globalTags.concat(array.tagList),
      });
      array.length = 0;
    }

    for (const array of this.rates.values()) {
      let value = array[0] || 0;
      if (array.length > 1) {
        value = array.reduce((acc, cur) => acc + cur, 0) / array.length;
      }

      series.push({
        metric: array.metric,
        type: 'rate',
        interval: this.flushPeriod,
        points: [[batchDate, value]],
        host: this.hostName,
        tags: this.globalTags.concat(array.tagList),
      });
      array.length = 0;
    }

    for (const array of this.counts.values()) {
      const value = array.reduce((acc, cur) => acc + cur, 0);
      series.push({
        metric: array.metric,
        type: 'count',
        interval: this.flushPeriod,
        points: [[batchDate, value]],
        host: this.hostName,
        tags: this.globalTags.concat(array.tagList),
      });
      array.length = 0;
    }

    // Actually transmit data to Datadog
    await Promise.all([
      (series.length === 0) ? Promise.resolve() : this.doHTTP('/v1/series', {series}),
      this.statusCheck('process.alive', 0, 'Datadog pump is running'),
    ]);
  }

  // Repo-local helpers
  listRefColls(ref) {
    const tokens = ref.path.split('/');
    const colls = [];
    for (let i = 0; i < tokens.length; i += 2) {
      colls.push(tokens[i]);
    }
    return colls.join('/');
  }
  getRefTags(ref) {
    const tokens = ref.path.split('/');
    if (!this.uidTagCache) return {};
    if (tokens[0] !== 'users' || tokens.length < 2) return {};
    const peeked = this.uidTagCache.peek(tokens[1]);
    if (peeked) return peeked;
    this.uidTagCache.get(tokens[1]);
    return {};
  }
  countFireOp(metric, ref, tags, count=1) {
    this.count(`firestore.${metric}`, count, {
      colls: this.listRefColls(ref),
      cache: 'none',
      ...this.getRefTags(ref),
      ...tags});
  }
}

// Grab first few bytes of any present IPv6 address
const v6Prefix = Object
  .values(os.networkInterfaces())
  .map(x => x.find(y => y.family === 'IPv6' && !y.internal))
  .filter(x => x)
  .map(x => x.address.split(':').slice(0,3).join(':'))
  [0] || null;

// Grab launched package.json
const {join, dirname} = require('path');
const mainDir = dirname(require.main.path);
const packageInfo = require(join(mainDir, 'package.json'));

// Set up the singleton metrics sender to share
exports.Datadog = new Datadog(
  process.env.DD_API_KEY || false,
  os.hostname(), {
    app: packageInfo.name,
    app_version: `${packageInfo.name}/${packageInfo.version}`,

    host_ipv6: v6Prefix,
    host_user: os.userInfo().username,
    host_os: `${os.type()} ${os.release()}`,
  });
