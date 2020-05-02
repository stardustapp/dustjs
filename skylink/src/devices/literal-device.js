const {PathFragment} = require('../api/path-fragment.js');
const {StringEntry} = require('../api/entries/');

// Read-only Device that just lets you poke at an Entry or skylink literal
// Most useful with Folder entries but also works with strings etc
class LiteralDevice {
  constructor(literal) {
    this.rootLiteral = literal;
  }

  static ofString(value) {
    const literal = new StringEntry('literal', value);
    return new LiteralDevice(literal);
  }

  getEntry(rawPath) {
    if (this.rootLiteral === null) {
      return null;
    }
    if (rawPath === '' || rawPath === '/') {
      return new LiteralEntry(this.rootLiteral);
    }

    const path = PathFragment.parse(rawPath);
    let entry = this.rootLiteral;

    for (const name of path.names) {
      if (entry.Children) {
        entry = entry.Children.find(x => x.Name === name);
      // } else if (entry.getEntry) {
      //   return entry.TODO
      } else {
        entry = null;
      }
      if (!entry) throw new Error(
        `getEntry("${rawPath}") missed at "${name}"`);
    }

    return new LiteralEntry(entry);
  }
}

class LiteralEntry {
  constructor(literal) {
    this.literal = literal;
  }

  get() {
    return this.literal;
  }

  enumerate(enumer) {
    if (this.literal.Type === 'Folder') {
      enumer.visit({Type: 'Folder'});
      if (enumer.canDescend()) {
        for (const child of this.literal.Children) {
          enumer.descend(child.Name);
          new LiteralEntry(child).enumerate(enumer);
          enumer.ascend();
        }
      }
    } else {
      enumer.visit(this.literal);
    }
  }
}

module.exports = {
  LiteralDevice,
  LiteralEntry,
};
