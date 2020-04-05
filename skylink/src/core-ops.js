const {FolderEntry, StringEntry} = require('./api/entries/');
const {EnumerationWriter, EnumerateIntoSubscription} = require('./api/enumeration.js');

const CoreOpsMap = new Map;

CoreOpsMap.set('ping', () => null);

CoreOpsMap.set('get', async function get(request) {
  const {Path} = request;

  var entry = await this.env.getEntry(Path);
  if (!entry) {
    throw new Error(`Path not found: ${Path}`);
  } else if (entry.get) {
    const value = await entry.get();
    if (value) return value;
    //throw new Error(`Path doesn't exist: ${Path}`);
    return null;
  } else {
    throw new Error(`Entry at ${Path} isn't gettable`);
  }
});

CoreOpsMap.set('store', async function store(request) {
  const {Dest} = request;
  const Input = request.Input;

  var entry = await this.env.getEntry(Dest);
  if (!entry) {
    throw new Error(`Path not found: ${Dest}`);
  } else if (entry.put) {
    return await entry.put(Input);
  } else {
    throw new Error(`Entry at ${Dest} isn't puttable`);
  }
});

CoreOpsMap.set('unlink', async function unlink(request) {
  const {Path} = request;

  var entry = await this.env.getEntry(Path);
  if (!entry) {
    throw new Error(`Path not found: ${Path}`);
  } else if (entry.put) {
    return await entry.put(null);
  } else {
    throw new Error(`Entry at ${Path} isn't unlinkable`);
  }
});

CoreOpsMap.set('enumerate', async function enumerate(request) {
  const {Path, Depth} = request;

  var entry = await this.env.getEntry(Path);
  if (!entry) {
    throw new Error(`Path not found: ${Path}`);
  } else if (entry.enumerate) {
    const enumer = new EnumerationWriter(Depth);
    await entry.enumerate(enumer);
    return enumer.toOutput();
  } else {
    throw new Error(`Entry at ${Path} isn't enumerable`);
  }
});

CoreOpsMap.set('subscribe', async function subscribe(request) {
  const {Path, Depth} = request;

  // get the channel constructor, we'll want it
  const newChan = await this.env.getEntry('/channels/new/invoke');
  if (!newChan || !newChan.invoke) {
    throw new Error(`Transport doesn't support channels, cannot subscribe`);
  }

  var entry = await this.env.getEntry(Path);
  if (!entry) {
    throw new Error(`Path not found: ${Path}`);
  } else if (entry.subscribe) {
    return await entry.subscribe(Depth, newChan);
  } else if (entry.enumerate) {
    return await EnumerateIntoSubscription(entry.enumerate.bind(entry), Depth, newChan);
  } else if (entry.get) {
    return newChan.invoke(async c => {
      try {
        const literal = await entry.get();
        if (literal) {
          literal.Name = 'entry';
          c.next(new FolderEntry('notif', [
            new StringEntry('type', 'Added'),
            new StringEntry('path', ''),
            literal,
          ]));
        }
        c.next(new FolderEntry('notif', [
          new StringEntry('type', 'Ready'),
        ]));
      } finally {
        c.error(new StringEntry('nosub',
            `This entry does not implement reactive subscriptions`));
      }
    });
  } else {
    throw new Error(`Entry at ${Path} isn't subscribable`);
  }
});

CoreOpsMap.set('invoke', async function invoke(request) {
  const {Path, Dest, Input} = request;

  var entry = await this.env.getEntry(Path);
  var output;
  if (!entry) {
    throw new Error(`Path not found: ${Path}`);
  } else if (entry.invoke) {
    output = await entry.invoke(Input);
  } else {
    throw new Error(`Entry at ${Path} isn't invokable`);
  }

  // if Dest, store the rich output in the tree
  if (!output) return null;
  if (Dest) {
    var outEntry = await this.env.getEntry(Dest);
    if (!outEntry) {
      throw new Error(`Dest path not found: ${Dest}`);
    } else if (outEntry.put) {
      await outEntry.put(output);
      return;
    } else {
      throw new Error(`Dest entry at ${Dest} isn't puttable`);
    }
  } else if (output.get) {
    // otherwise just return a flattened output
    return await output.get();
  } else if (output.Type) {
    return output;
  } else if (output) {
    throw new Error(`Output of ${Path} isn't gettable, please use Dest`);
  }
});

module.exports = {
  CoreOpsMap,
};
