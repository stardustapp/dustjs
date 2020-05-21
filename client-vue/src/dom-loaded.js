export const domLoaded = new Promise(resolve =>
  document.addEventListener('DOMContentLoaded', resolve));
