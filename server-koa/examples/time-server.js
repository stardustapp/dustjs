const {WebServer, SkylinkExport} = require('..');
const {
  Environment, FolderEntry, StringEntry,
  StatelessHttpSkylinkClient, WebsocketSkylinkClient,
} = require('@dustjs/skylink');

// primary access point of the time-server
class TimeEntry {

  // simple get-only API, accessible via POST interface
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
      }, 1000);

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

  // create time API
  const publicEnv = new Environment;
  publicEnv.bind('/current-time', {
    getEntry(path) {
      if (path !== '') return null;
      return new TimeEntry();
    },
  });

  // serve it
  const web = new WebServer();
  web.mountApp('/~~export', new SkylinkExport(publicEnv));
  console.log('Listening on', await web.listen(9230));

  // test ourselves once
  const exportUrl = web.selfDescribeUri({ path: '/~~export' });
  // support using in a test suite
  const isOneShot = process.argv.includes('--one-shot');
  try {
    console.log();
    console.group(`Sending test request to ${exportUrl}`);

    // Test a get() using the stateless POST transport
    const postClient = new StatelessHttpSkylinkClient(exportUrl);
    const getResp = await postClient.volley({
      Op: 'get',
      Path: '/current-time'});
    if (getResp.Ok !== true) throw new Error(
      `Self-test response wasn't Ok!`);
    console.log('get() output:', getResp.Output.StringValue);

    // Open a WebSocket transport and subscribe to time updates
    const wsClient = new WebsocketSkylinkClient(exportUrl+'/ws');
    await wsClient.ready;
    const subResp = await wsClient.volley({
      Op: 'subscribe',
      Path: '/pub/current-time'});
    if (subResp.Ok !== true) throw new Error(
      `Self-test response wasn't Ok!`);

    // Log times for 3s
    const times = new Array;
    setTimeout(() => subResp.Output.stop(), 3100);
    await new Promise((resolve, reject) => {
      subResp.Output.channel.forEach(pkt => {
        const time = pkt.getChild('current time').StringValue;
        times.push(time);
        console.log('Received current time:', time);
      }, reject, resolve);
    });

    if (times.length !== 4) throw new Error(
      `Time subscription expected 4 values, received ${times.length}`);
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
