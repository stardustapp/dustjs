const Koa = require('koa');
const route = require('koa-route');
const koaBody = require('koa-body');
const websockify = require('koa-websocket');

const {
  StringEntry,
  Environment, TempDevice,
  SkylinkServer,
  ChannelExtension, InlineChannelCarrier,
  ReversedSkylinkClient, InlineChannelClient,
} = require('@dustjs/skylink');

exports.SkylinkExport = class SkylinkExport {
  constructor(publicEnv) {
    if (!publicEnv)
      throw new Error(`SkylinkExport requires a publicEnv`);
    this.publicEnv = publicEnv;

    const websockify = require('koa-websocket');
    this.koa = websockify(new Koa());
    this.koa.use(koaBody());

    this.koa.use(route.post('/', async ctx => {
      // console.log('export POST:', ctx.request.body);

      if (ctx.request.body == null) ctx.throw(400,
        `Request body is required for POST`);
      if (typeof ctx.request.body.Op !== 'string') ctx.throw(400,
        `"Op" field is required in POST`);

      const skylinkServer = new SkylinkServer(this.publicEnv);
      // uses processFrame - doesn't support request-intercepting extensions
      ctx.response.body = await skylinkServer.processFrame(ctx.request.body);
    }));

    this.koa.use(route.get('/ping', async ctx => {
      ctx.response.body = 'ok';
    }));

    this.koa.ws.use(route.all('/ws', async (ctx) => {
      try {
        const socket = new SkylinkWebsocket(ctx.websocket, this.publicEnv);
      } catch (err) {
        console.log('ws accept error:', err);
      }
    }));
  }
}

class SkylinkWebsocket {
  constructor(webSocket, publicEnv) {
    this.webSocket = webSocket;

    // create a new environment just for this connection
    this.env = new Environment();
    this.env.bind('/tmp', new TempDevice);
    this.env.bind('/pub', publicEnv);

    this.skylink = new SkylinkServer(this.env, this.postMessage.bind(this));
    this.skylink.attach(new ChannelExtension());
    this.skylink.attach(new InlineChannelCarrier());
    this.skylink.attach(new ReversedSkylinkClient([
      new InlineChannelClient(),
    ]));

    this.isActive = false;
    this.reqQueue = new Array;

    webSocket.on('message', this.on_message.bind(this));
    webSocket.on('close', this.on_close.bind(this));
  }

  postMessage(body) {
    if (this.webSocket) {
      this.webSocket.send(JSON.stringify(body));
      // console.log('server --> client', JSON.stringify(body));
      if (body._after) body._after();
    } else {
      console.warn(`TODO: channel's downstream websocket isnt connected anymore`)
    }
  }

  // These functions are invoked by the websocket processor
  on_message(msg) {
    // console.log('server <-- client', msg);
    let request;
    try {
      request = JSON.parse(msg);
    } catch (err) {
      this.skylink.handleShutdown(new StringEntry('reason',
        `Couldn't parse JSON from your websocket frame`));
    }
    if (this.isActive) {
      this.reqQueue.push(request);
    } else {
      this.isActive = true;
      this.processRequest(request);
    }
  }
  on_close() {
    this.skylink.handleShutdown(new StringEntry('reason',
      'WebSocket was closed'));
    // TODO: shut down session
  }

  async processRequest(request) {
    try {
      // console.log(request);
      await this.skylink.receiveFrame(request);
      // console.log(response);

    //const stackSnip = (err.stack || new String(err)).split('\n').slice(0,4).join('\n');
    } catch (err) {
      console.error('WS ERR:', err);
    } finally {
      // we're done with the req, move on
      if (this.reqQueue.length) {
        this.processRequest(this.reqQueue.shift());
      } else {
        this.isActive = false;
      }
    }
  }
}
