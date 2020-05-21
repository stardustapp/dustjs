import resolve from '@rollup/plugin-node-resolve';
// import commonjs from '@rollup/plugin-commonjs';
import ignore from 'rollup-plugin-ignore';
import { terser } from 'rollup-plugin-terser';
import pkg from './package.json';

const external = [
  'ws', 'node-fetch',
];

export default [
  // browser-friendly UMD build
  {
    input: 'src/main.js',
    external: ['ws', 'node-fetch'],
    output: {
      name: 'DustClient',
      file: pkg.browser,
      format: 'umd',
      sourcemap: true,
      globals: {
        'ws': 'WebSocket',
        'node-fetch': 'fetch',
      },
    },
    plugins: [
      ignore(['path', 'fs/promises']), // used for nodejs filesystem-device.js
      terser(),
      resolve(), // so Rollup can find `skylink`
      // commonjs(), // so Rollup can convert things to an ES module
    ],
  },

  // CommonJS (for Node) and ES module (for bundlers) build.
  {
    input: 'src/main.js',
    external: [
      ...external,
      '@dustjs/skylink',
    ],
    output: [
      {
        file: pkg.main,
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: pkg.module,
        format: 'es',
        sourcemap: true,
      },
    ],
    plugins: [
    ],
  },
];
