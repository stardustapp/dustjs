const entries = {
  ...require('./BlobEntry.js'),
  ...require('./DeviceEntry.js'),
  ...require('./FolderEntry.js'),
  ...require('./StringEntry.js'),
};

function InflateSkylinkLiteral(raw) {
  if (!raw) {
    return null;
  }
  if (raw.constructor !== Object) {
    throw new Error(`Raw skylink literal wasn't an Object, please read the docs`);
  }
  if (!raw.Type) {
    throw new Error(`Raw skylink literal ${JSON.stringify(raw.Name||raw)} didn't have a Type, please check your payload`);
  }
  switch (raw.Type) {

    case 'String':
      return new entries.StringEntry(raw.Name || '', raw.StringValue);

    case 'Folder':
      const folder = new entries.FolderEntry(raw.Name || '');
      (raw.Children || []).forEach(child => {
        folder.append(InflateSkylinkLiteral(child))
      });
      return folder;

    case 'Blob':
      return new entries.BlobEntry(raw.Name || '', raw.Data, raw.Mime);

    case 'JS':
      return raw.Data;

    default:
      throw new Error(`skylink literal had unimpl Type ${raw.Type}`);
  }
};

module.exports = {
  ...entries,
  InflateSkylinkLiteral,
};
