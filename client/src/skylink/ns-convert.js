import * as base64js from 'base64-js';

// recursive wire=>data
export function entryToJS (ent) {
  if (ent == null) {
    return null;
  }
  switch (ent.Type) {

    case 'Folder':
      const obj = {};
      (ent.Children || []).forEach(child => {
        obj[child.Name] = entryToJS(child);
      });
      return obj;

    case 'String':
      return ent.StringValue;

    case 'Blob':
      return {
        mimeType: ent.Mime,
        asText() {
          if (ent.Mime && (ent.Mime.startsWith('text/') || ent.Mime.toLowerCase().includes('utf-8'))) {
            if (typeof Buffer != 'undefined') {
              const buffer = Buffer.from(ent.Data || '', 'base64');
              return buffer.toString('utf-8'); // TODO: encoding
            } else {
              const encoded = base64js.toByteArray(ent.Data || '');
              // TODO: make browser Blob?
              return new TextDecoder('utf-8').decode(encoded);
            }
          } else throw new Error(
            `BUG: called asText() on a binary blob, MIME "${ent.Mime}"`);
        },
      };
  }
}
