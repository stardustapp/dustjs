
// e.g. 2017-10-29T08:15:26.519783309Z
const isoStringPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)Z$/;
function parseDateStringOrThrow(dateString) {
  if (!isoStringPattern.test(dateString)) {
    if (/^\d{10}$/.test(dateString)) {
      return new Date(parseInt(dateString)*1000);
    }
    throw new Error(
      `date field given non-ISO string "${dateString}", refusing`);
  }

  const dateValue = new Date(dateString);
  // check for "Invalid Date"
  if (!dateValue.toJSON()) throw new Error(
    `date field given invalid string "${dateString}", refusing`);

  return dateValue;
}
exports.parseDateStringOrThrow = parseDateStringOrThrow;
