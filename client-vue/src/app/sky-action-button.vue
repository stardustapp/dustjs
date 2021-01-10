<template>
  <button @click="onChange" v-bind="attrs">
    <slot/>
  </button>
</template>

<script>
export default {
  props: {
    path: String,
    attrs: { type: Object, default: () => ({}) },
    actionOp: { type: String, default: 'invoke' },
    actionValue: String,
  },
  methods: {
    onChange(evt) {
      if (this.actionValue == null) return alert('No value assigned to button');

      if (this.actionOp === 'store') {
        window.skylinkP.then((x) => x
          .putString("/" + this.path, this.actionValue));
      } else if (this.actionOp === 'invoke') {
        window.skylinkP.then((x) => x
          .invoke("/" + this.path, this.actionValue));
      }
    },
  },
};
</script>
