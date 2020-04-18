# \@dustjs/server-koa

Full-featured Skylink HTTP Service implemented using the [Koa][koa] webserver ecosystem.

Note that 'Skylink' is a domain-specific protocol
used for the forever-in-development Stardust project.

The `SkylinkExport` class accepts an `Environment` from `@dustjs/skylink`
and configures a Koa mount which accepts both Skylink communication methods:

* `POST /`: Stateless request/response using HTTP bodies containing JSON.
* `GET /ws`: Stateful WebSockets allowing clients to utilize temporary state on the server.
* `GET /ping`: Simple health-check endpoint for consumers to see if they can talk to their server.

The `WebServer` class wraps setting up a Koa instance for use with Skylink.
You can set up your own Koa server instead for more flexibility,
but you'll have to explicitly configure and route websockets to your `SkylinkExport`.

[koa]: https://koajs.com/

## Usage
```sh
npm i --save @dustjs/server-koa
```

Once you have an `Environment` instance you'd like to serve access to,
starting a single-purpose server would like like this:

```js
const {WebServer, SkylinkExport} = require('@dustjs/server-koa');

const web = new WebServer();
web.mountApp('/~~export', new SkylinkExport(myPublicEnvironment));

// listen() arguments passed directly to https://nodejs.org/api/net.html#net_server_listen
console.log('Skylink listening on', await web.listen(9236, '0.0.0.0'));
```

## Examples
Check out `examples/echo-server.js` for a complete example of
creating and invoking a simple Skylink service.

For a more complex example, `examples/time-server.js` demonstrates
creating a reactive (WebSocket-based) endpoint and streaming data from it.

Finally, `examples/reversal-server.js` configures a Reversal server which allows
individual clients to "mount" their own client-side API into the server's API
for other clients to consume. This is useful for exposing Skylink APIs from web browsers
and similar limited environments.
