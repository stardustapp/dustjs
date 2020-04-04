// TODO: solidify into a decent cross-platform random string library

exports.randomString = function randomString(bytes=10) { // 32 for a secret
  const array = new Uint8Array(bytes);
  (crypto.getRandomValues || crypto.randomFillSync).call(crypto, array);
  let str = Buffer
    .from(array)
    .toString('base64')
  // let str = base64js
  //   .fromByteArray(array)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  // TODO: debug/account for too-short IDs
  //console.log('random str', bytes, str);
  return str;
}

exports.makeRandomNid = function makeRandomNid() {
  let nid = Math.random().toString(16).slice(2);
  // pad out nid if it ended in zeroes
  if (nid.length >= 13) return nid;
  return nid + new Array(14 - nid.length).join('0');
}
