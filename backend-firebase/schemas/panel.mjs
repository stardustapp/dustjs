import {Elements as DataTree} from '@dustjs/data-tree';

export const config = {
  '/prefs': new DataTree.Document({
    '/userstyle': new DataTree.CompiledFile('text/css', {
      '.css': 'text/css',
      '.scss': 'text/x-scss',
    }),
  }),
};

export const persist = {
};
