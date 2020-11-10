import fetch from 'node-fetch';
import {SkylinkClient} from './client.js';

export class StatelessHttpSkylinkClient extends SkylinkClient {
  constructor(endpoint) {
    super();
    this.endpoint = endpoint;
    this.fetch = (fetch === globalThis.fetch) ? fetch.bind(globalThis) : fetch;
  }

  async volley(request) {
    const resp = await this.fetch(this.endpoint, {
      method: 'POST',
      body: JSON.stringify(request),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (resp.status < 200 || resp.status >= 300)
      throw new Error(`Skylink op failed with HTTP ${resp.status}`);
    return this.decodeOutput(await resp.json());
  }
}
