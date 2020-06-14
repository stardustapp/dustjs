// This gets filled with all the class constructors by-name
const frameConstructors = require('./index.js');

// Things that can be put in a single document without concern
const constructableFamilies = [
  'Primitive',
  'Document',
  'Map',
  'List',
  'Blob',
  'Meta',
];

exports.constructFrame = function constructFrame(name, nodeSpec, lens) {
  const {family} = nodeSpec;
  if (!constructableFamilies.includes(nodeSpec.family)) throw new Error(
    `TODO: Construct frame with field family ${nodeSpec.family}`);

  const frameConstr = frameConstructors[`${family}Frame`];
  if (!frameConstr) throw new Error(
    `BUG: Missing constructor for field family ${nodeSpec.family}`);

  return new frameConstr(name, nodeSpec, lens);
};
