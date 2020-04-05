const fetch = require('node-fetch');
const {SkylinkClient} = require('./client.js');

class StatelessHttpSkylinkClient extends SkylinkClient {
  constructor(endpoint) {
    super();
    this.endpoint = endpoint;
  }

  async volley(request) {
    const resp = await fetch(this.endpoint, {
      method: 'POST',
      body: JSON.stringify(request),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (resp.status < 200 || resp.status >= 300)
      throw new Error(`Skylink op failed with HTTP ${resp.status}`);
    return resp.json();
  }
}

module.exports = {
  StatelessHttpSkylinkClient,
};
