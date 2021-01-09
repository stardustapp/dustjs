<template>
  <form
    ref="form"
    :class="'sky-form status-' + this.status"
    @submit.prevent="submit"
  >
    <slot />
  </form>
</template>

<script>
export default {
  props: {
    action: String,
    path: String,
  },
  data() {
    return {
      status: "Ready",
    };
  },
  methods: {
    submit(evt) {
      if (this.action != "store-child-folder") {
        alert("invalid form action " + this.action);
        throw new Error("invalid form action");
      }

      // check for double-submit racing
      if (this.status == "Pending") {
        console.warn("rejecting concurrent submission in sky-form");
        return;
      }

      this.status = "Pending";
      // construct body to submit
      const { form } = this.$refs;
      const elems = [].slice.call(form.elements);
      const input = {};
      elems.forEach((el) => {
        if (el.name) {
          input[el.name] = el.value;
        }
      });

      const setReadonly = (value) =>
        elems.forEach((el) => {
          if (el.localName === "input" && el.type !== "checkbox") {
            el.readOnly = value;
          } else {
            el.disabled = value;
          }
        });

      switch (this.action) {
        case "store-child-folder":
          setReadonly(true);
          console.log("submitting", input, "to", "/" + this.path);
          window.skylinkP.then((skylink) => {
            skylink
              .mkdirp("/" + this.path)
              .then(() => skylink.storeRandom("/" + this.path, input))
              .then(
                (id) => {
                  setReadonly(false);
                  evt.target.reset();
                  this.status = "Ready";
                },
                (err) => {
                  setReadonly(false);
                  this.status = "Failed";
                  throw err;
                }
              );
          });
          break;

        case "invoke-with-folder":
          setReadonly(true);
          console.log("submitting", input, "to", "/" + this.path);
          window.skylinkP.then((skylink) => {
            skylink.invoke("/" + this.path, input).then(
              (id) => {
                setReadonly(false);
                evt.target.reset();
                this.status = "Ready";
              },
              (err) => {
                setReadonly(false);
                this.status = "Failed";
                throw err;
              }
            );
          });
          break;

        default:
          alert("bad sky-form action " + this.action);
      }
    },
  },
};
</script>

<style>
.sky-form.status-Failed {
  background-color: rgba(255, 0, 0, 0.2);
}
</style>
