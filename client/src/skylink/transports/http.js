class SkylinkHttpTransport {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  // noop. TODO: prevent requests when not started
  start() {
  }
  stop() {
  }

  exec(request) {
    if (request.Op === 'subscribe') {
      throw new Error("HTTP transport does not support subscriptions");
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
    .then(this.checkOk);
  }

  // Chain after a fetch() promise with .then()
  checkHttpOk(resp) {
    if (resp.status >= 200 && resp.status < 400) {
      return resp;
    } else {
      return Promise.reject(`Stardust op failed with HTTP ${resp.status}`);
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