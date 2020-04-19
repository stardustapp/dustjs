const entries = {
  ...require('./BlobEntry.js'),
  ...require('./DeviceEntry.js'),
  ...require('./FolderEntry.js'),
  ...require('./StringEntry.js'),
  ...require('./ErrorEntry.js'),
};

// TODO: better browser-ready source of error origin info
const errorAuthority = require('os').hostname();

function InflateSkylinkLiteral(raw, extraInflaters=null) {
  if (!raw) return null;

  if (raw.constructor !== Object) throw new Error(
    `Raw skylink literal wasn't an Object, please read the docs`);
  if (typeof raw.Type !== 'string') throw new Error(
    `Raw skylink literal ${JSON.stringify(raw.Name||raw)} didn't have a Type string, please check your payload`);
  switch (raw.Type) {

    case 'String':
      return new entries.StringEntry(raw.Name || '', raw.StringValue);

    case 'Folder':
      return new entries.FolderEntry(raw.Name || '', (raw.Children || [])
        .map(child => InflateSkylinkLiteral(child, extraInflaters)));

    case 'Blob':
      return new entries.BlobEntry(raw.Name || '', raw.Data, raw.Mime);

    case 'Error':
      return new entries.ErrorEntry(raw.Name || '', raw.Code, raw.Authority, raw.StringValue);

    // TODO: proper class (maybe even with a callable?)
    case 'Function':
      return raw;
      // return new entries.FunctionEntry(raw.Name || '');

    // case 'JS':
    //   return raw.Data;

    default:
      if (extraInflaters && extraInflaters.has(raw.Type)) {
        const translated = extraInflaters.get(raw.Type)(raw);
        if (!translated || translated.Type !== raw.Type) throw new Error(
          `BUG: Inflater for ${raw.Type} returned ${translated ? translated.Type : 'nothing'}`);
        return translated;
      }

      console.log('WARN: inflater saw unhandled Type in', raw);
      return new entries.ErrorEntry(raw.Name || '', 'unimpl-type', 'skylink/inflate@'+errorAuthority, `Skylink literal had unimpl Type ${raw.Type}, cannot deflate`);
  }
};

function DeflateToSkylinkLiteral(entry, extraDeflaters=null) {
  if (!entry) return null;

  if (typeof entry.Type !== 'string') throw new Error(
    `BUG: Skylink entry ${JSON.stringify(entry.Name||entry)} didn't have a Type`);
  switch (entry.Type) {

    case 'String':
      return {
        Type: 'String',
        Name: entry.Name || '',
        StringValue: `${entry.StringValue || ''}`,
      };

    case 'Folder':
      return {
        Type: 'Folder',
        Name: entry.Name || '',
        Children: (entry.Children || []).map(child =>
          DeflateToSkylinkLiteral(child, extraDeflaters)),
      };

    // TODO:
    // case 'Blob':
    //   return new entries.BlobEntry(entry.Name || '', entry.Data, entry.Mime);

    case 'Error':
      return {
        Type: 'Error',
        Name: entry.Name || '',
        Code: entry.Code || '',
        Authority: entry.Authority || '',
        StringValue: `${entry.StringValue || ''}`,
      };

    case 'Function':
      return {
        Type: 'Function',
        Name: entry.Name || '',
      };

      // case 'JS':
      //   return entry.Data;

    default:
      if (extraDeflaters && extraDeflaters.has(entry.Type)) {
        const translated = extraDeflaters.get(entry.Type)(entry);
        if (!translated || translated.Type !== entry.Type) throw new Error(
          `BUG: Deflater for ${entry.Type} returned ${translated ? translated.Type : 'nothing'}`);
        return translated;
      }
      throw new Error(`skylink entry had unimpl Type ${entry.Type}`);
  }
};

module.exports = {
  ...entries,
  InflateSkylinkLiteral,
  DeflateToSkylinkLiteral,
};
