export const domLoaded = new Promise(resolve =>
  (document.readyState === 'loading')
  ? document.addEventListener('DOMContentLoaded', resolve)
  : resolve());
