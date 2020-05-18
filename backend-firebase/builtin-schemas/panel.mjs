export const metadata = {
  AppName: 'Config Panel',
  Author: 'Daniel Lamando',
  License: 'MIT',
};
export function builder(El, addRoot) {

  addRoot(new El.AppRegion('config', {
    '/prefs': new El.Document({
      '/userstyle.css': new El.Blob('text/css', 'utf-8'),
    }),
  }));

}
