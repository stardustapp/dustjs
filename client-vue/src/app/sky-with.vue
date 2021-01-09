<template>
  <component :is="el || 'div'">
    <slot v-bind="item"></slot>
  </component>
</template>

<script>
export default {
  props: {
    path: String,
    el: String,
  },
  data: () => ({
    item: null,
    nonce: null,
  }),
  watch: {
    path(path) {
      this.switchTo(path);
    },
  },
  created() {
    this.switchTo(this.path);
  },
  destroyed() {
    if (this.sub) {
      this.sub.stop();
    }
  },
  methods: {
    switchTo(path) {
      if (this.sub) {
        this.sub.stop();
      }

      // TODO: fetch subs from cache
      console.log("updating sky-with to", path);
      this.item = null;
      const nonce = ++this.nonce;

      window.skylinkP
        .then((skylink) => skylink.subscribe("/" + path, { maxDepth: 1 }))
        .then((chan) => {
          const sub = new DustClient.FlatSubscription(chan);
          this.sub = sub;
          return sub.readyPromise;
        })
        .then((fields) => {
          if (this.nonce === nonce) {
            this.item = fields;
            this.nonce = null;
          } else {
            console.warn(
              "sky-with sub on",
              path,
              "became ready, but was cancelled, ignoring"
            );
          }
        });
    },
  },
};
</script>
