import SkyInfiniteTimelineLog from './sky-infinite-timeline-log.vue';
import SkyMenuToggle from './sky-menu-toggle.vue';
import SkySideMenu from './sky-side-menu.vue';

export const components = {
  'sky-infinite-timeline-log': SkyInfiniteTimelineLog,
  'sky-menu-toggle': SkyMenuToggle,
  'sky-side-menu': SkySideMenu,
};

// Declare install function executed by Vue.use()
export function install(Vue) {
	if (install.installed) return;
	install.installed = true;

  for (const tag of Object.keys(components)) {
    Vue.component(tag, components[tag]);
  }
}
