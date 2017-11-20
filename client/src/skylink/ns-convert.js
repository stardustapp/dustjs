// recursive wire=>data
function entryToJS (ent) {
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

  }
}
