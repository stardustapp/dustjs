import SkyActionButton from './sky-action-button.vue';
import SkyActionCheckbox from './sky-action-checkbox.vue';
import SkyAuthForm from './sky-auth-form.vue';
import SkyDatetimeField from './sky-datetime-field.vue';
import SkyForeach from './sky-foreach.vue';
import SkyForm from './sky-form.vue';
import SkySession from './sky-session.vue';
import SkyWith from './sky-with.vue';

export const components = {
  'sky-action-button': SkyActionButton,
  'sky-action-checkbox': SkyActionCheckbox,
  'sky-auth-form': SkyAuthForm,
  'sky-datetime-field': SkyDatetimeField,
  'sky-foreach': SkyForeach,
  'sky-form': SkyForm,
  'sky-session': SkySession,
  'sky-with': SkyWith,
};

// Declare install function executed by Vue.use()
export function install(Vue) {
	if (install.installed) return;
	install.installed = true;

  for (const tag of Object.keys(components)) {
    Vue.component(tag, components[tag]);
  }
}
