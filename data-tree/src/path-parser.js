export function parseAbsolutePath(string) {
  if (string === '') {
    string = '/';
  }

  const isAbsolute = string.startsWith('/');
  if (isAbsolute) {
    string = string.slice(1);
  } else throw new Error(
    `parseAbsolutePath given non-abs path "${string}"`);

  const parts = (string.length === 0) ? [] : string.split('/');

  const emptyIdx = parts.indexOf('');
  if (emptyIdx >= 0) throw new Error(
    `Paths cannot include zero-length names`);

  return parts.map(decodeURIComponent);
}
