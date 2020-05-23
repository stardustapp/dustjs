const {FolderEntry} = require('@dustjs/skylink');

async function mkdirp(device, path, justEnsure=false) {
  try {
    entry = await device.getEntry(path);
    // console.log({device, entry, path, justEnsure})
    const literal = await entry.get();
    if (literal) return false; // exists!
  } catch (err) {
    if (!(err.message.includes(`doesn't exist, can't be gotten`)))
      throw err;
  }

  if (justEnsure)
    throw new Error(`checked for folder at "${path}" but that path wasn't found`);

  const allParts = path.slice(1).split('/');
  const curParts = [];
  for (const part of allParts) {
    curParts.push(part);
    const curPath = '/'+curParts.join('/');

    let entry;
    try {
      entry = await device.getEntry(curPath);
      const literal = await entry.get();
      if (literal) continue; // exists!
    } catch (err) {
      if (!(err.message.includes(`doesn't exist, can't be gotten`)))
        throw err;
    }

    if (!entry || !entry.put)
      throw new Error('Failed to auto-create folder', curPath, `because it wasn't writable`);

    console.log('mkdirp creating folder', curPath);
    await entry.put(new FolderEntry(decodeURIComponent(part)));
  }
  return true;
}

module.exports = {
  mkdirp,
};
