export class SkylinkHttpTransport {
  constructor(endpoint) {
    this.endpoint = endpoint;

    // Mark good once a ping goes in. Never mark done.
    var doneAnswer;
    this.connPromise = this.exec({Op: 'ping'});
    this.donePromise = new Promise((resolve, reject) => doneAnswer = {resolve, reject});
  }

  // noop. TODO: prevent requests when not started
  start() {
  }
  stop() {
  }

  exec(request) {
    if (request.Op === 'subscribe') {
      return Promise.reject(new Error("HTTP transport does not support subscriptions"));
    }

    return fetch(this.endpoint, {
      method: 'POST',
      body: JSON.stringify(request),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })
    .then(this.checkHttpOk)
    .then(x => x.json())
    .then(this.checkOk)
    .then(x => x, err => {
      if (typeof process === 'undefined' || !process.argv.includes('-q'))
        console.warn('Failed netop:', request);
      return Promise.reject(err);
    });
  }

  // Chain after a fetch() promise with .then()
  checkHttpOk(resp) {
    if (resp.status >= 200 && resp.status < 400) {
      return resp;
    } else {
      return Promise.reject(new Error(`Stardust op failed with HTTP ${resp.status}`));
    }
  }

  // Chain after a json() promise with .then()
  checkOk(obj) {
    if (obj.ok === true || obj.Ok === true) {
      return obj;
    } else {
      //alert(`Stardust operation failed:\n\n${obj}`);
      this.stats.fails++;
      return Promise.reject(obj);
    }
  }
}
