import * as mixinMethods from './mixin-methods.js';

// Declare install function executed by Vue.use()
export function install(Vue) {
	if (install.installed) return;
	install.installed = true;

  Vue.mixin({
    methods: mixinMethods,
  });
};
