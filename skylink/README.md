# \@dustjs/skylink

A common implementation of the Skylink object model, protocol, and extensions in JavaScript.
This module is used by all other modules utilizing Skylink in order to reuse important constructs.

A set of Skylink client implementations are included as well.
These let you talk to an arbitrary Skylink server.
However, in order to *serve* Skylink, you'd want to use
an additional module such as `\@dustjs/server-koa`.

Note that 'Skylink' is a domain-specific protocol
used for the forever-in-development Stardust project.

## Usage
```sh
npm i --save @dustjs/skylink
```

Often times, the first thing a Skylink-using program does is set up an operating `Environment`.
It can then mount remote processes into the tree, or expose a subsection of the tree as a service.
For example:

```js
const {Environment, TempDevice} = require('@dustjs/skylink');

// create application's namespace
const env = new Environment();
env.bind('/tmp', new TempDevice);
env.bind('/source', new FilesystemDevice('./source/'));

// read a source file
const sourceEntry = await env.getEntry('/source/app.js');
const sourceBlob = await sourceEntry.get();
myCompileFunc(sourceBlob.Data);
```
