import {BlobEntry} from './BlobEntry.js';
import {DeviceEntry} from './DeviceEntry.js';
import {FolderEntry} from './FolderEntry.js';
import {StringEntry} from './StringEntry.js';
import {ErrorEntry} from './ErrorEntry.js';

// TODO: better browser-ready source of error origin info
const errorAuthority =
  (typeof require === 'function')
  ? require('os').hostname()
  : 'module'

export function InflateSkylinkLiteral(raw, extraInflaters=null) {
  if (!raw) return null;

  if (raw.constructor !== Object) throw new Error(
    `Raw skylink literal wasn't an Object, please read the docs`);
  if (typeof raw.Type !== 'string') throw new Error(
    `Raw skylink literal ${JSON.stringify(raw.Name||raw)} didn't have a Type string, please check your payload`);
  switch (raw.Type) {

    case 'String':
      return new StringEntry(raw.Name || '', raw.StringValue);

    case 'Folder':
      return new FolderEntry(raw.Name || '', (raw.Children || [])
        .map(child => InflateSkylinkLiteral(child, extraInflaters)));

    case 'Blob':
      return new BlobEntry(raw.Name || '', raw.Data, raw.Mime);

    case 'Error':
      return new ErrorEntry(raw.Name || '', raw.Code, raw.Authority, raw.StringValue);

    // TODO: proper class (maybe even with a callable?)
    case 'Function':
      return raw;
      // return new FunctionEntry(raw.Name || '');

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
      return new ErrorEntry(raw.Name || '', 'unimpl-type', 'skylink/inflate@'+errorAuthority, `Skylink literal had unimpl Type ${raw.Type}, cannot deflate`);
  }
};
