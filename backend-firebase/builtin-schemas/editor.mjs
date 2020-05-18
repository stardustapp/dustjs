export const metadata = {
  AppName: 'Tree Editor',
  Author: 'Daniel Lamando',
  License: 'MIT',
};
export function builder(El, addRoot) {

  addRoot(new El.AppRegion('config', {
    '/prefs': new El.Document({
      '/userstyle.css': new El.Blob('text/css', 'utf-8'),
    }),
  }));

  addRoot(new El.AppRegion('persist', {
    '/bookmarks': new El.Collection({
      '/path': String,
      '/label': String,
      '/color': String,
    }),
  }));

}
