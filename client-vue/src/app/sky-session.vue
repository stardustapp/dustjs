<template>
  <div class="sky-session">
    <div :class="'indicator status-' + orbiter.status" />
    {{ orbiter.status }} &mdash;&nbsp;
    <span class="chart">{{ launcher.chartName }}</span
    ><!--@{{launcher.domainName}}-->/{{ launcher.appId }}
    <div class="filler" />
    <div v-if="session.currentUser" style="padding: 0 0.4em">
      {{ session.currentUser.email }}
      <button type="button" @click="signout">signout</button>
    </div>
    <!--{{sess.ownerName}} | {{sess.uri}}-->
    {{ stats.ops }}o {{ stats.chans }}c {{ stats.pkts }}p {{ stats.fails }}f
  </div>
</template>

<script>
import { sessionApp } from "../session-app.js";

export default {
  data: () => ({
    orbiter: orbiter,
    launcher: orbiter.launcher,
    stats: {},
    session: sessionApp,
  }),
  created() {
    window.skylinkP.then(() => (this.stats = orbiter.skylink.stats));
  },
  methods: {
    signout() {
      firebase.auth().signOut();
    },
  },
};
</script>

<style>
/* TIL this works. sue me */
body {
  position: absolute;
  top: 2em;
  left: 0;
  right: 0;
  bottom: 0;
  height: auto !important;
}
html,
body {
  height: 100%;
  margin: 0;
}

.sky-session {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2em;

  background-color: #000;
  color: #fff;

  display: flex;
  align-items: center;
  padding: 0 0.5em;
}

.sky-session .indicator {
  width: 1em;
  height: 1em;
  border: 1px solid gray;
  border-radius: 0.5em;
  margin: 0 0.4em;
  background-color: gray;
}
.sky-session .indicator.status-Ready {
  background-color: green;
}

.sky-session .filler {
  flex: 1;
}
</style>
