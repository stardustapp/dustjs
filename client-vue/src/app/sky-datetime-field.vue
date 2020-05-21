<template>
  <input type="hidden" :name="name" :value="value" />
</template>

<script>
export default {
  props: {
    name: String,
    type: String,
  },
  computed: {
    value() {
      switch (this.type) {
        case 'current-timestamp':
          return new Date().toISOString();
        default:
          alert('bad sky-datetime-field type '+this.type);
          return null;
      }
    },
  },
};
</script>
