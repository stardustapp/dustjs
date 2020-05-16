import {Elements as DataTree} from '@dustjs/data-tree';

export const config = {
  '/prefs': new DataTree.Document({
    '/userstyle.css': new DataTree.Blob('text/css', 'utf-8'),
  }),
};

export const persist = {
  '/bookmarks': new DataTree.Collection({
    '/path': String,
    '/label': String,
    '/color': String,
  }),
};
