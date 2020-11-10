import {domLoaded} from './dom-loaded.js'
import * as DustClient from '@dustjs/client'

export async function bootNow() {
  await domLoaded;

  window.orbiter = new DustClient.Orbiter('firebase');
  var promise = orbiter.autoLaunch()
    .then(() => {
      window.skylink = orbiter.mountTable.api;
      return window.skylink;
    }, err => {
      alert(`Couldn't open chart. Server said: ${err}`);
      throw err;
    });
  window.skylinkP = promise;

  var router;
  if (window.appRouter) {
    router = appRouter;
  } else if (window.VueRouter) {
    console.warn(`Creating blank vue router`);
    router = new VueRouter({
      mode: 'hash',
      routes: [
        //{ name: 'context', path: '/network/:network/context/:type/:context', component: ViewContext },
      ],
    });
  }

  const app = new Vue({
    el: '#app',
    router,
    data: {
      dataPath: '/persist',
      prefs: {},
      ready: false,
    },
    methods: {
    },
    mounted() {
      // apply userstyle.css from persist/<app>/prefs/
      let style = document.createElement('style');
      style.type = 'text/css';
      style.appendChild(document.createTextNode(''));
      document.head.appendChild(style);
      this.userStyleTag = style;
    },
    computed: {
      userStyle() {
        const blob = this.prefs['userstyle.css'];
        if (blob) { return blob.asText(); }
      },
    },
    watch: {
      userStyle(css) {
        if (this.userStyleTag) {
          this.userStyleTag.childNodes[0].textContent = css;
        }
      },
    },
    created() {
      // TODO: i think something else sets this later
      window.app = this;

      promise.then(() => {
        skylink.subscribe(`/config/${orbiter.launcher.appId}/prefs`, {
          maxDepth: 1,
        }).then(chan => {
          const prefChan = chan.channel.map(ent => {
            if (ent.path) {
              ent.path = ent.path.replace(/-(.)/g, (_, char) => char.toUpperCase());
            }
            return ent;
          });
          const sub = new DustClient.FlatSubscription({
            channel: prefChan,
            stop: chan.stop.bind(chan),
          }, this);
          this.prefSub = sub;
          return sub.readyPromise;
        }).then(prefs => {
          this.prefs = prefs;
        }).finally(() => {
          this.ready = true;
        });
      });
    },
  });

  // provide helper to set a temp pref
  // TODO: better way?
  window.setPref = (prefName, value) => {
    app.$set(app.prefs, prefName, value || '');
  };

  return app;
};
