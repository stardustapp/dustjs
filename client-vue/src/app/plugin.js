import SkyActionCheckbox from './sky-action-checkbox.vue';
import SkyAuthForm from './sky-auth-form.vue';
import SkyDatetimeField from './sky-datetime-field.vue';
import SkyForeach from './sky-foreach.vue';
import SkyForm from './sky-form.vue';
import SkySession from './sky-session.vue';
import SkyWith from './sky-with.vue';

// Declare install function executed by Vue.use()
export function install(Vue) {
	if (install.installed) return;
	install.installed = true;

  Vue.component('sky-action-checkbox', SkyActionCheckbox);
  Vue.component('sky-auth-form', SkyAuthForm);
  Vue.component('sky-datetime-field', SkyDatetimeField);
  Vue.component('sky-foreach', SkyForeach);
  Vue.component('sky-form', SkyForm);
  Vue.component('sky-session', SkySession);
  Vue.component('sky-with', SkyWith);
}
