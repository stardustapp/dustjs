import vue from 'rollup-plugin-vue';
import css from 'rollup-plugin-css-only';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'src/index.js',
    external: [
      'vue',
      '@dustjs/client',
    ],
    output: {
      name: 'DustClientVue',
      file: 'dist/dustjs-client-vue.umd.js',
      format: 'umd',
      sourcemap: true,
      globals: {
        vue: 'Vue',
        '@dustjs/client': 'DustClient',
      //   'ws': 'WebSocket',
      //   'node-fetch': 'fetch',
      },
    },
    plugins: [
      vue(),
      css({ output: 'dist/dustjs-client-vue.css' }),
      terser(),
    ],
  },
];
