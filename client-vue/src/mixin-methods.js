export function skyStoreString(path, value) {
  return promise.then(x => x.putString('/'+path, value));
};

export function skyUnlink(path) {
  return promise.then(x => x.unlink('/'+path));
};

// TODO: the sidebar should handle this itself probably, close-on-navigate
export function closeNav(evt) {
  const {classList} = document.querySelector('#left-menu');
  if (classList.contains('open')) {
    classList.add('animate');
    classList.remove('open');
  }
};
