import ignore from 'rollup-plugin-ignore';
import { terser } from 'rollup-plugin-terser';
import pkg from './package.json';

const external = [
  'ws', 'node-fetch',
];

export default [
  // browser-friendly UMD build
  {
    input: 'src/index.js',
    external,
    output: {
      name: 'DustSkylink',
      file: pkg.browser,
      format: 'umd',
      sourcemap: true,
      globals: {
        'ws': 'WebSocket',
        'node-fetch': 'fetch',
      },
    },
    plugins: [
      // used for nodejs filesystem-device.js
      ignore(['path', 'fs/promises']),
      // minify
      terser(),
    ],
  },

  // CommonJS (for Node) build.
  {
    input: 'src/index.js',
    external: [
      ...external,
      'path', 'fs/promises',
    ],
    output: [
      {
        file: pkg.main,
        format: 'cjs',
        sourcemap: true,
      },
    ],
    plugins: [
    ],
  },
];
