import Vue from 'vue';
import {domLoaded} from './dom-loaded.js';

// Little box of state for the user's session
export const sessionApp = new Vue({
  data: {
    isReady: false,
    currentUser: null,
    // idToken: null,
  },
  methods: {
  },
  created() {
    domLoaded.then(() => {
      firebase.auth().onAuthStateChanged(user => {
        console.log({user});
        this.isReady = true;
        // this.idToken = null;

        if (user) {
          const {uid, displayName, photoURL, email, emailVerified, isAnonymous, metadata, providerData} = user;
          this.currentUser = {uid, displayName, photoURL, email, emailVerified, isAnonymous, metadata, providerData};
          // this.idToken = await user.getIdToken();
          // // TODO: set up orbiter
        } else {
          // TODO: probably support logging out of a running page
          if (this.currentUser) document.location.reload();
          this.currentUser = false;
        }
      });
    });
  },
});
