// A 'name' is any UTF-8 string of nonzero length.
// A 'part' is a name that has been encodeURIComponent'd.
// A 'path' is a string of slash-seperated parts.
// Paths can be absolute, meaning they have a preceding slash.

export class PathFragment {
  constructor(isAbsolute, parts=[]) {
    if (typeof isAbsolute !== 'boolean') throw new Error(
      `PathFragment takes isAbsolute bool as the first param`);

    const emptyIdx = parts.indexOf('');
    if (emptyIdx >= 0 && emptyIdx !== parts.length-1) throw new Error(
      `Paths cannot include zero-length names`);

    this.isAbsolute = isAbsolute;
    this.parts = parts.slice(0);
  }
  get names() {
    return this.parts.map(decodeURIComponent);
  }

  static parse(string) {
    if (string === '') {
      string = '/';
    }

    const isAbsolute = string.startsWith('/');
    if (isAbsolute) {
      string = string.slice(1);
    }

    const parts = (string.length === 0) ? []
      : string.split('/');
    return new PathFragment(isAbsolute, parts);
  }

  // shorthands for 'other' construction
  static from(thing, isAbsolute=true) {
    if (thing == null) throw new Error(
      `BUG: called PathFragment.from(null)`);
    switch (thing.constructor) {
      case Array:
        return new PathFragment(isAbsolute, thing);
      case String:
        return PathFragment.parse(thing);
      case PathFragment:
        return thing.clone();
      default: throw new Error(
        `BUG: called PathFragment.from() with a ${thing.constructor}, not a path-like thing`);
    }
  }

  static parseUri(uri) {
    // parse whole thing as a URI
    if (!uri.includes('://')) throw new Error(
      `that doesn't look like a URI`);
    const match = uri.match(/^(\w+):\/\/(([a-zA-Z0-9._-]+)(?::(\d+))?)(\/[^?#]*|)(\?[^#]+)?(#.+)?$/);
    if (!match) throw new Error(
      `that didn't parse like a URI`);

    // label the groups and parse the path
    const [_, scheme, host, hostname, port, path, query, fragment] = match;
    return {
      scheme, host, hostname, port, path, query, fragment,
      path: PathFragment.parse(path || ''),
      queryParams: this.parseQueryString(query),
    };
  }

  // TODO: doesn't belong in this file
  static parseQueryString(query) {
    const formData = new FormData;
    if (query && query.startsWith('?')) {
      for (const part of query.slice(1).split('&')) {
        if (part.includes('=')) {
          const idx = part.indexOf('=');
          const key = decodeURIComponent(part.slice(0, idx));
          const val = decodeURIComponent(part.slice(idx+1));
          formData.append(key, val);
        } else {
          formData.append('', decodeURIComponent(part));
        }
      }
    }
    return formData;
  }

  pushName(name) {
    if (name === '') throw new Error(
      `Paths cannot include zero-length names`);
    this.parts.push(encodeURIComponent(name));
  }
  pushPart(part) {
    if (part === '') throw new Error(
      `Paths cannot include zero-length parts`);
    this.parts.push(part);
  }

  lastPart() {
    if (this.parts.length === 0) throw new Error(
      `no parts to get last of`);
    return this.parts[this.parts.length-1];
  }
  lastName() {
    if (this.parts.length === 0) throw new Error(
      `no parts to get last of`);
    return decodeURIComponent(this.parts[this.parts.length-1]);
  }

  popPart() {
    return this.parts.pop();
  }
  popName() {
    return decodeURIComponent(this.parts.pop());
  }

  count() {
    return this.parts.length;
  }
  slice(...arg) {
    return new PathFragment(this.isAbsolute, this.parts.slice(...arg));
  }

  startsWith(other) {
    const that = PathFragment.from(other, this.isAbsolute);
    if (this.isAbsolute !== that.isAbsolute)
      return false;
    if (that.parts.length > this.parts.length)
      return false;
    for (let i = 0; i < that.parts.length; i++)
      if (this.parts[i] !== that.parts[i])
        return false;
    return true;
  }
  equals(other) {
    const that = PathFragment.from(other, this.isAbsolute);
    if (this.isAbsolute !== that.isAbsolute)
      return false;
    if (that.parts.length !== this.parts.length)
      return false;
    for (let i = 0; i < that.parts.length; i++)
      if (this.parts[i] !== that.parts[i])
        return false;
    return true;
  }
  matchWith(other) {
    const pattern = PathFragment.from(other, this.isAbsolute);
    if (pattern.isAbsolute !== this.isAbsolute) {
      return {
        ok: false,
      };
    }

    let patternIdx = 0;
    let thisIdx = 0;
    const match = {
      ok: true,
      params: new Map,
    };
    while (match.ok && pattern.count() > patternIdx) {
      const patternPart = pattern.parts[patternIdx];
      if (patternPart.startsWith(':*')) {
        //console.log(this.parts, pattern.parts, match);
        const restParts = this.parts.slice(thisIdx);
        thisIdx = this.parts.length;
        match.params.set(patternPart.slice(2), restParts);

      } else if (patternPart.startsWith(':')) {
        // dynamic name
        // for sanity, dots are taken as file extensions and thus arent allowed unless an ext is specified.
        // :*rest           eats the rest of the names, whatever they are, and assigns the list to 'rest'. must be last.
        // :name            matches thing1 but not thing.1
        // :name.txt        matches thing1.txt and thing.1.txt
        // :name@.+@        matches thing1 and thing.1, and whatever really
        // :name@\d+@.txt   does not match thing1.txt but does match 1234.txt
        //               TODO: said regex support!
        if (patternPart.includes('@')) {
          console.warn('regex not impl yet:', patternPart, thisPart, thisIdx);
          match.ok = false;
        }

        if (this.parts.length <= thisIdx) {
          match.ok = false;
          break;
        }

        const thisPart = this.parts[thisIdx];

        // don't match a trailing slash as a named child
        if (thisPart === '') {
          match.ok = false;
          break;
        }

        // break if ext is wanted and isn't provided
        const wantsExt = patternPart.includes('.');
        if (wantsExt) {
          const extension = patternPart.slice(patternPart.lastIndexOf('.'));
          if (!thisPart.endsWith(extension)) {
            match.ok = false;
            break;
          }
        } else if (thisPart.includes('.')) {
          match.ok = false;
          break;
        }

        match.params.set(patternPart.slice(1), decodeURIComponent(thisPart));
        thisIdx++;
      } else {
        // anything else is a literal name i guess
        const thisPart = this.parts[thisIdx];
        if (thisPart !== patternPart) {
          match.ok = false;
        }
        thisIdx++;
      }
      patternIdx++;
    }
    if (match.ok && thisIdx < this.parts.length) {
      //console.warn('had extra parts after match was done');
      match.ok = false;
    }

    //console.log(this.parts, pattern.parts, match);
    return match;
  }

  clone() {
    return new PathFragment(this.isAbsolute, this.parts);
  }
  toString() {
    return (this.isAbsolute ? '/' : '') + this.parts.join('/');
  }
}
