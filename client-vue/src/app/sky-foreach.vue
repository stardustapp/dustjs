<template>
  <component :is="el||'div'">
    <slot name="header"></slot>
    <slot v-for="item in items" name="item" v-bind="item"></slot>
    <slot v-if="stats.hidden" name="hiddenNotice" :count="stats.hidden"></slot>
  </component>
</template>

<script>
export default {
  props: {
    path: String,
    el: String,
    filter: Object,
    fields: String,
    depth: Number,
  },
  data: () => ({
    items: [],
    stats: {},
    nonce: null,
  }),
  watch: {
    path(path) { this.switchTo(path) },
  },
  created() { this.switchTo(this.path) },
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
      console.log('updating sky-foreach to', path);
      this.items = [];
      const nonce = ++this.nonce;

      window.skylinkP
        .then(skylink => skylink.subscribe('/'+this.path, {maxDepth: this.depth+1}))
        .then(chan => {
          if (this.nonce !== nonce) {
            console.warn('sky-foreach sub on', path, 'became ready, but was cancelled, ignoring');
            return;
          }
          this.nonce = null;

          const sub = new DustClient.RecordSubscription(chan, {
            basePath: this.path,
            filter: this.filter,
            fields: this.fields.split(' '),
          });
          console.log('sky-foreach sub started');
          this.sub = sub;
          this.items = sub.items;
          this.stats = sub.stats;
        });
    },
  },
};
</script>
