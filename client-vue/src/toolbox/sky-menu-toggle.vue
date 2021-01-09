<template>
  <a href="#menu" class="menu" @click.prevent="toggleMenu">
    <i class="material-icons">menu</i>
  </a>
</template>

<script>
export default {
  methods: {
    openMenu() {
      const menu = document.querySelector("#left-menu");
      if (!menu.classList.contains("open")) {
        menu.classList.add("animate");
        menu.classList.add("open");
      }
    },
    toggleMenu() {
      const menu = document.querySelector("#left-menu");
      menu.classList.add("animate");
      if (menu.classList.contains("open")) {
        menu.classList.remove("open");
      } else {
        menu.classList.add("open");
      }
    },
  },
};
</script>
