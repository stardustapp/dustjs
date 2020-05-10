// import {Primitive} from './Primitive.mjs';
// import {BaseNode} from './_base.mjs';
//
// const objectMap = new Map;
//
// // e.g. 2017-10-29T08:15:26.519783309Z
// const isoStringPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)Z$/;
// function parseDateStringOrThrow(dateString) {
//   if (!isoStringPattern.test(dateString)) {
//     if (/^\d{10}$/.test(dateString)) {
//       return new Date(parseInt(dateString));
//     }
//     throw new Error(
//       `date field given non-ISO string "${dateString}", refusing`);
//   }
//
//   const dateValue = new Date(dateString);
//   // check for "Invalid Date"
//   if (!dateValue.toJSON()) throw new Error(
//     `date field given invalid string "${dateString}", refusing`);
//
//   return dateValue;
// }
//
// export function processFields(subPaths) {
//   // config.cacheMap = config.cacheMap || new Map;
//   // if (config.objectMap.has(subPaths)) {
//   //   return config.objectMap.get(subPaths);
//   // }
//
// }
//
// export function processField(pathType) {
//   switch (true) {
//
//     case pathType instanceof BaseConfig:
//     case pathType instanceof BaseNode:
//       return pathType;
//
//     case pathType.constructor === Object:
//
//
//     case pathType === String:
//       return new Primitive({
//         toStringValue(raw) {
//           return `${raw}`;
//         },
//         fromStringValue(val) {
//           return val || '';
//         },
//       });
//       break;
//
//     case pathType === Boolean:
//       return new Primitive({
//         toStringValue(raw) {
//           return raw ? 'yes' : 'no';
//         },
//         fromStringValue(val) {
//           return val === 'yes';
//         },
//       });
//
//     case pathType === Number:
//       return new Primitive({
//         toStringValue(raw) {
//           return `${raw || 0}`;
//         },
//         fromStringValue(val) {
//           return parseFloat(val);
//         },
//       });
//
//     case pathType === Date:
//       return new Primitive({
//         toStringValue(raw) {
//           return raw ? raw.toISOString() : null;
//         },
//         fromStringValue(val) {
//           return val ? parseDateStringOrThrow(val) : null;
//         },
//       });
//
//     default: throw new Error(
//       `TODO: unmapped DataTree field`);
//   }
// }
