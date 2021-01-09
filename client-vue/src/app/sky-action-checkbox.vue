<template>
  <input type="checkbox" @click="onChange" />
</template>

<script>
export default {
  props: {
    path: String,
    checkedValue: String,
  },
  methods: {
    onChange(evt) {
      const { checked } = evt.target;
      if (checked && this.checkedValue) {
        window.skylinkP.then((x) =>
          x.putString("/" + this.path, this.checkedValue)
        );
      }
    },
  },
};
</script>
