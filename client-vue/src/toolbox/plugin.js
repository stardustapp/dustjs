import SkyInfiniteTimelineLog from './sky-infinite-timeline-log.vue';
import SkyMenuToggle from './sky-menu-toggle.vue';
import SkySideMenu from './sky-side-menu.vue';

// Declare install function executed by Vue.use()
export function install(Vue) {
	if (install.installed) return;
	install.installed = true;

  Vue.component('sky-infinite-timeline-log', SkyInfiniteTimelineLog);
  Vue.component('sky-menu-toggle', SkyMenuToggle);
  Vue.component('sky-side-menu', SkySideMenu);
}
