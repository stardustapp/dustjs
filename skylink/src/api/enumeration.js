const {FolderEntry, StringEntry, ErrorEntry} = require('./entries/');

class EnumerationWriter {
  constructor(depth) {
    this.depth = depth;
    this.entries = []; // log of nodes we've visited
    this.names = []; // stack of where we're walking. .join('/')
  }

  visit(literal) {
    literal.Name = this.names.map(encodeURIComponent).join('/');
    this.entries.push(literal);
    return this;
  }

  canDescend() {
    return this.names.length < this.depth;
  }
  remainingDepth() {
    return this.depth - this.names.length;
  }

  descend(name) {
    this.names.push(name);
    return this;
  }
  ascend() {
    if (this.names.length === 0) throw new Error(
      `BUG: EnumerationWriter ascended above its root`);
    this.names.pop();
    return this;
  }

  // Transclude an external enumeration at the current visitation point
  // TODO: catch over-walking, and something else i forget
  visitEnumeration(entry) {
    if (entry.Type !== 'Folder') throw new Error(
      `This isn't a Folder!`);
    if (entry.Name !== 'enumeration') throw new Error(
      `This isn't an enumeration!`);

    const enumPrefix = this.names.map(encodeURIComponent).join('/');
    for (const literal of entry.Children) {
      if (enumPrefix) {
        literal.Name = enumPrefix + (literal.Name ? ('/' + literal.Name) : '');
      }
      this.entries.push(literal);
    }
  }

  toOutput() {
    if (this.names.length > 0) throw new Error(
      `BUG: EnumerationWriter asked to serialize, but is still descended`);
    return new FolderEntry('enumeration', this.entries);
  }

  // Converts the completed enumeration output into a NSAPI literal structure
  reconstruct() {
    if (this.names.length > 0) throw new Error(
      `BUG: EnumerationWriter asked to reconstruct, but is still descended`);

    const outputStack = new Array;
    for (const entry of this.entries) {
      const parts = entry.Name.split('/');
      if (entry.Name === '')
        parts.pop(); // handle root-path case

      while (parts.length < outputStack.length) {
        outputStack.pop();
      }
      if (parts.length === outputStack.length) {
        entry.Name = decodeURIComponent(parts[parts.length-1] || '');
        const parent = outputStack[outputStack.length - 1]
        if (parent) {
          if (parent.Type !== 'Folder') throw new Error(
            `enumerate put something inside a non-folder ${parent.Type}`);
          parent.Children.push(entry);
        }
        outputStack.push(entry);
        if (entry.Type === 'Folder' && !entry.Children) {
          entry.Children = [];
        }
      }
    }
    return outputStack[0];
  }
}


// Provides a shitty yet complete non-reactive subscription
// Gets its data from the provided enumeration lambda
// Shuts down the channel when it's down as a signal downstream
function EnumerateIntoSubscription(enumHandler, depth, newChannel) {
  return newChannel.invoke(async c => {
    const enumer = new EnumerationWriter(depth);
    const enumeration = await enumHandler(enumer);
    for (const entry of enumer.toOutput().Children) {
      const fullName = entry.Name;
      entry.Name = 'entry';
      c.next(new FolderEntry('notif', [
        new StringEntry('type', 'Added'),
        new StringEntry('path', fullName),
        entry,
      ]));
    }
    c.next(new FolderEntry('notif', [
      new StringEntry('type', 'Ready'),
    ]));
    c.error(new StringEntry('nosub',
      `This entry does not implement reactive subscriptions`));
  });
}

class FlatEnumerable {
  constructor(...things) {
    this.list = things.slice(0);
  }
  async get() {
    return new FolderEntry('enumerable', this.list);
  }
  async enumerate(enumer) {
    enumer.visit(new FolderEntry());
    if (!enumer.canDescend()) return;
    for (const child of this.list) {
      enumer.descend(child.Name);
      if (enumer.canDescend() && child.enumerate) {
        await child.enumerate(enumer);
      } else if (child.get) {
        enumer.visit(await child.get());
      } else {
        enumer.visit(child);
      }
      enumer.ascend();
    }
  }
}

module.exports = {
  EnumerationWriter,
  EnumerateIntoSubscription,
  FlatEnumerable,
};
