// import resolve from 'rollup-plugin-node-resolve';
// import commonjs from 'rollup-plugin-commonjs';
import { terser } from "rollup-plugin-terser";
import pkg from './package.json';

export default [
  // browser-friendly UMD build
  {
    input: 'src/main.js',
    output: {
      name: 'DustClient',
      file: pkg.browser,
      format: 'umd',
      sourcemap: true,
    },
    plugins: [
      terser(),
      // resolve(), // so Rollup can find `ms`
      // commonjs() // so Rollup can convert `ms` to an ES module
    ],
  },

  // CommonJS (for Node) and ES module (for bundlers) build.
  {
    input: 'src/main.js',
    // external: ['ms'],
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
      terser(),
    ],
  },
];
