const {WebServer, SkylinkExport} = require('..');
const {
  Environment, FolderEntry, StringEntry, DeviceEntry,
  WebsocketSkylinkClient, StatelessHttpSkylinkClient,
  SkylinkReversalExtension, ChannelExtension, InlineChannelCarrier
} = require('@dustjs/skylink');

// basic streamable API that we want to publish
class TimeEntry {
  get() {
    return new StringEntry('current time',
      new Date().toISOString());
  }
  // complex 'reactive' API, only accessible over WebSocket
  subscribe(Depth, newChannel) {
    return newChannel.invoke(async c => {
      console.log('server: user subscribed to current-time');

      // send first timestamp
      c.next(new FolderEntry('notif', [
        new StringEntry('type', 'Added'),
        new StringEntry('path', ''),
        { Name: 'entry', ...this.get() },
      ]));

      // send timestamp 'updates' regularly
      const interval = setInterval(() => {
        c.next(new FolderEntry('notif', [
          new StringEntry('type', 'Changed'),
          new StringEntry('path', ''),
          { Name: 'entry', ...this.get() },
        ]));
      }, 250);

      // clean up when the user disconnects
      c.onStop(() => {
        console.log('server: user disconnected from current-time');
        clearInterval(interval);
        c.done();
      });
    });
  }
}

(async function() {

  // create endpoint mgmt API
  const publicEnv = new Environment;
  publicEnv.bind('/endpoints', {
    // offer nothing within the endpoints
    // this low-key hides the endpoint list from enumeration
    getEntry(path) { return null; },
  });
  publicEnv.mount('/publish-endpoint', 'function', {
    async invoke(input) {
      const name = input.getChild('Name', true, 'String').StringValue;
      const sourceDev = input.getChild('Source', true, 'Device');
      // mount the client's offered device in our public environment
      publicEnv.bind(`/endpoints/${encodeURIComponent(name)}`, sourceDev);
      return new StringEntry('result', 'ok');
    }});

  // serve it
  const web = new WebServer();
  web.mountApp('/~~export', new SkylinkExport(publicEnv));
  console.log('Listening on', await web.listen(9230));

  // support using in a test suite
  const isOneShot = process.argv.includes('--one-shot');
  try {
    const exportUrl = web.selfDescribeUri({ path: '/~~export' });
    console.log();
    console.group(`Mounting a test client to ${exportUrl}`);

    // create another environment that we want to share from a client
    const clientEnv = new Environment();
    clientEnv.bind('/current-time', {
      getEntry(path) {
        if (path !== '') return null;
        return new TimeEntry();
      },
    });

    console.log();
    console.log('==> Connecting reversible client with a Time API');

    // connect a reversible client
    const wsClient = new WebsocketSkylinkClient(exportUrl+'/ws');
    wsClient.attach(new SkylinkReversalExtension([
      // allow inline channels from us to the server
      new ChannelExtension(),
      new InlineChannelCarrier(),
    ]));
    await wsClient.ready;

    // publish our time API to the server
    const pubResp = await wsClient.volley({
      Op: 'invoke',
      Path: '/pub/publish-endpoint/invoke',
      Input: new FolderEntry('Publication', [
        new StringEntry('Name', 'time-api'),
        new DeviceEntry('Source', clientEnv),
      ])});
    if (pubResp.Ok !== true) throw new Error(
      `Publish response wasn't Ok!`);

    console.log();
    console.log('==> Performing get() test');

    // Test a get() using the stateless POST transport
    const postClient = new StatelessHttpSkylinkClient(exportUrl);
    const getResp = await postClient.volley({
      Op: 'get',
      Path: '/endpoints/time-api/current-time'});
    if (getResp.Ok !== true) throw new Error(
      `Self-test response wasn't Ok!`);
    console.log('get() output:', getResp.Output.StringValue);

    console.log();
    console.log('==> Performing subscribe() test');

    // Open a second WebSocket transport and subscribe to time updates
    const wsClient2 = new WebsocketSkylinkClient(exportUrl+'/ws');
    await wsClient2.ready;
    const subResp = await wsClient2.volley({
      Op: 'subscribe',
      Path: '/pub/endpoints/time-api/current-time'});
    if (subResp.Ok !== true) throw new Error(
      `Self-test response wasn't Ok!`);

    // Log times for a fixed period
    const times = new Array;
    setTimeout(() => subResp.Output.stop(), 1000);
    await new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error(`Nothing happened in test`)), 5000);

      subResp.Output.channel.forEach(pkt => {
        const time = pkt.getChild('current time', true, 'String').StringValue;
        times.push(time);
        console.log('Received current time:', time);
      }, reject, resolve);
    });

    // check what we received
    if (times.length !== 5) throw new Error(
      `Time subscription expected 5 values, received ${times.length}`);
    console.log('Looks good!');

  } catch (err) {
    console.warn(`WARN: Self-test failed:`, err.message);
    if (isOneShot) throw err;

  } finally {
    console.groupEnd();
    console.log();
  }
  if (isOneShot) process.exit(0);

})().catch(err => {
  console.log(err);
  process.exit(10);
});
