export function DeflateToSkylinkLiteral(entry, extraDeflaters=null) {
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

    case 'Blob':
      return {
        Type: 'Blob',
        Name: entry.Name || '',
        Mime: entry.Mime || '',
        Data: entry.Data || '',
      };

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
