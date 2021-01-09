<template>
  <div class="sky-auth-form" v-if="isVisible">
    <div :class="banner.type + ' banner'" v-if="banner.type">
      <div class="message">
        <strong>{{ banner.label }}</strong
        >: {{ banner.message }}
        <code v-if="banner.code">{{ banner.code }}</code>
      </div>
    </div>

    <form class="modal-form" @submit.prevent="submitLogin">
      <h1>
        login to <em>{{ appName }}</em>
      </h1>

      <!-- button grabbed from https://developers.google.com/identity/sign-in/web/build-button -->
      <div
        v-if="googleAuth"
        @click.prevent="startGoogleLogin"
        style="height: 50px; margin: 0.25em 1em; font-size: 1.3em"
        class="abcRioButton abcRioButtonBlue"
      >
        <div class="abcRioButtonContentWrapper">
          <div class="abcRioButtonIcon" style="padding: 15px">
            <div
              style="width: 18px; height: 18px"
              class="abcRioButtonSvgImageWithFallback abcRioButtonIconImage abcRioButtonIconImage18"
            >
              <svg
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                width="18px"
                height="18px"
                viewBox="0 0 48 48"
                class="abcRioButtonSvg"
              >
                <g>
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  ></path>
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  ></path>
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  ></path>
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  ></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </g>
              </svg>
            </div>
          </div>
          <span
            style="font-size: 16px; line-height: 48px"
            class="abcRioButtonContents"
          >
            <span id="not_signed_in87ksyc5kakim">Sign in with Google</span>
            <span id="connected87ksyc5kakim" style="display: none"
              >Signed in with Google</span
            >
          </span>
        </div>
      </div>

      <div
        v-if="googleAuth && emailPassAuth"
        style="align-self: center; margin: 1em"
      >
        &mdash; or &mdash;
      </div>

      <template v-if="emailPassAuth">
        <input
          :readonly="isPending"
          type="email"
          name="email"
          placeholder="email address"
          autocomplete="email"
          required
          autofocus
        />
        <input
          :readonly="isPending"
          type="password"
          name="password"
          placeholder="password"
          autocomplete="current-password"
          required
        />
        <button type="submit" :disabled="isPending">log in</button>
      </template>
    </form>

    <!-- Let implementors add extra links etc -->
    <slot></slot>
    <!--div style="align-self: center;">
      <a href="#" @click="showRegister">or register a new account</a>
    </div-->

    <div class="fill"></div>
    <footer>
      powered by the Stardust platform, built by
      <a href="https://danopia.net">danopia</a>
    </footer>
  </div>
</template>

<script>
import { sessionApp } from "../session-app.js";

export default {
  props: {
    appName: { type: String, default: "untitled app" },
    googleAuth: { type: Boolean, default: true },
    emailPassAuth: { type: Boolean, default: false },
  },
  data: () => ({
    isPending: false,
    banner: {},
    session: sessionApp,
  }),
  computed: {
    isVisible() {
      return this.session.currentUser === false;
    },
  },
  methods: {
    startGoogleLogin() {
      if (this.isPending) return;
      const provider = new firebase.auth.GoogleAuthProvider();
      firebase
        .auth()
        .signInWithPopup(provider)
        .catch(
          (error) =>
            (this.banner = {
              type: "error",
              label: "Error",
              message: error.message,
              code: error.code,
            })
        )
        .then(() => (this.isPending = false));
      this.isPending = true;

      this.banner = {
        type: "info",
        label: "Auth",
        message: "Signing in...",
      };
    },
    submitLogin(evt) {
      if (this.isPending) return;
      firebase
        .auth()
        .signInWithEmailAndPassword(
          evt.target.email.value,
          evt.target.password.value
        )
        .catch(
          (error) =>
            (this.banner = {
              type: "error",
              label: "Error",
              message: error.message,
              code: error.code,
            })
        )
        .then(() => (this.isPending = false));
      this.isPending = true;

      this.banner = {
        type: "info",
        label: "Auth",
        message: "Signing in...",
      };
    },
  },
};
</script>

<style>
/* TODO: slim this down to what's needed for login/register */

.sky-auth-form {
  background-image: linear-gradient(145deg, #3e4b66 0%, #1f2533 100%);
  background-attachment: fixed;
  color: #fff;
  font-family: Roboto, sans;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.sky-auth-form > * {
  flex-shrink: 0;
}
.sky-auth-form footer {
  max-width: 40em;
  margin: 5em auto 3em;
  text-align: center;
  color: #999;
}
.sky-auth-form .fill {
  flex: 1;
}
@media (max-width: 599px) {
  .sky-auth-form footer {
    margin: 2em auto 1em;
  }
}

.sky-auth-form a {
  color: #ccc;
}
.sky-auth-form .action {
  display: block;
  border: 3px solid #ccc;
  margin: 1em;
  padding: 0.7em 2em;
  text-decoration: none;
}
.sky-auth-form .alt-action {
  border-color: #999;
}
.sky-auth-form .action:hover {
  border-color: #fff;
  color: #fff;
  background-color: rgba(255, 255, 255, 0.15);
  text-decoration: underline;
}

.sky-auth-form .banner,
.sky-auth-form .modal-form {
  box-shadow: 2px 5px 15px 1px rgba(15, 15, 25, 0.25);
}

.sky-auth-form .banner {
  margin: 3em 0 -3em;
  padding: 1em;
  width: 40em;
  align-self: center;
}
.sky-auth-form .banner code {
  display: block;
  margin-top: 0.5em;
  color: rgb(255,160,140);
}
.sky-auth-form .inline-banner {
  margin: 1em 1.3em;
  padding: 1em 0;
  text-align: left;
}
.sky-auth-form .info {
  background-color: #0277bd;
  color: #e1f5fe;
}
.sky-auth-form .error {
  background-color: #b71c1c;
  color: #ffebee;
}
.sky-auth-form .banner .message,
.sky-auth-form .inline-banner .message {
  font-size: 1.2em;
  margin: 0 1em;
  word-break: break-word;
}

.modal-form a {
  color: #333;
}
.modal-form .action {
  border-color: #666;
}
.modal-form .action:hover {
  border-color: #000;
  color: #000;
  background-color: rgba(0, 0, 0, 0.15);
}

.modal-form {
  display: flex;
  flex-direction: column;
  width: 100vw;
  box-sizing: border-box;
  background-color: #eee;
  text-align: center;
  color: #000;
  margin: 5em auto 3em;
  padding: 2em 1em;
}
@media (min-width: 600px) {
  .modal-form {
    min-width: 20em;
    max-width: 30em;
  }
}
.modal-form.compact {
  margin: 1em auto;
  padding: 1em 1em;
}
.modal-form input,
.modal-form select,
.modal-form button {
  font-size: 1.3em;
  margin: 0.25em 1em;
  padding: 0.5em 1em;
  display: block;
  border: 3px solid #ccc;
}
.modal-form input:focus,
.modal-form select:focus,
.modal-form button:focus {
  border-color: #666;
  box-shadow: 0 0 4px 1px rgba(50, 50, 50, 0.3);
  outline: none;
}
.modal-form input:hover,
.modal-form select:hover,
.modal-form button:hover {
  border-color: #999;
  outline: none;
}
.modal-form input {
  background-color: #fff;
}
.modal-form select {
  background-color: #fff;
}
.modal-form button {
  background-color: rgba(0, 0, 0, 0.15);
  cursor: pointer;
  color: #333;
}
.modal-form h1,
.modal-form h2 {
  margin: 0.2em 1em 0.5em;
  font-weight: 300;
  color: #000;
}
.modal-form input {
  letter-spacing: 1px;
}
.modal-form input[type="password"]:not(:placeholder-shown) {
  letter-spacing: 4px;
}
.modal-form input[disabled] {
  background-color: #f3f3f3;
}
.modal-form h1 em {
  font-weight: 400;
  font-style: normal;
}
.modal-form .row {
  display: flex;
}
.modal-form .row label {
  align-self: center;
  color: #000;
  font-size: 1.2em;
  margin-right: 2em;
  letter-spacing: 1px;
}
.modal-form .hint {
  margin-top: 0;
}

.abcRioButton {
  border-radius: 1px;
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.25);
  box-sizing: border-box;
  transition: background-color 0.218s, border-color 0.218s, box-shadow 0.218s;
  -webkit-user-select: none;
  -webkit-appearance: none;
  background-color: #fff;
  background-image: none;
  color: #262626;
  cursor: pointer;
  outline: none;
  overflow: hidden;
  /* position:relative; */
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
  width: auto;
}
.abcRioButton:hover {
  box-shadow: 0 0 3px 3px rgba(66, 133, 244, 0.3);
}
.abcRioButtonBlue {
  background-color: #4285f4;
  border: none;
  color: #fff;
}
.abcRioButtonBlue:hover {
  background-color: #4285f4;
}
.abcRioButtonBlue:active {
  background-color: #3367d6;
}
.abcRioButtonLightBlue {
  background-color: #fff;
  color: #757575;
}
.abcRioButtonLightBlue:active {
  background-color: #eee;
  color: #6d6d6d;
}
.abcRioButtonIcon {
  float: left;
}
.abcRioButtonBlue .abcRioButtonIcon {
  background-color: #fff;
  -webkit-border-radius: 1px;
  border-radius: 1px;
}
.abcRioButtonSvg {
  display: block;
}
.abcRioButtonContents {
  font-family: Roboto, arial, sans-serif;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.21px;
  margin-left: 6px;
  margin-right: 6px;
  vertical-align: top;
}
.abcRioButtonContentWrapper {
  height: 100%;
  width: 100%;
}
.abcRioButtonBlue .abcRioButtonContentWrapper {
  border: 1px solid transparent;
}
.abcRioButtonErrorWrapper,
.abcRioButtonWorkingWrapper {
  display: none;
  height: 100%;
  width: 100%;
}
.abcRioButtonErrorIcon,
.abcRioButtonWorkingIcon {
  margin-left: auto;
  margin-right: auto;
}
.abcRioButtonErrorState,
.abcRioButtonWorkingState {
  border: 1px solid #d5d5d5;
  border: 1px solid rgba(0, 0, 0, 0.17);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
  color: #262626;
}
.abcRioButtonErrorState:hover,
.abcRioButtonWorkingState:hover {
  border: 1px solid #aaa;
  border: 1px solid rgba(0, 0, 0, 0.25);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
}
.abcRioButtonErrorState:active,
.abcRioButtonWorkingState:active {
  border: 1px solid #aaa;
  border: 1px solid rgba(0, 0, 0, 0.25);
  box-shadow: inset 0 1px 0 #ddd;
  color: #262626;
}
.abcRioButtonWorkingState,
.abcRioButtonWorkingState:hover {
  background-color: #f5f5f5;
}
.abcRioButtonWorkingState:active {
  background-color: #e5e5e5;
}
.abcRioButtonErrorState,
.abcRioButtonErrorState:hover {
  background-color: #fff;
}
.abcRioButtonErrorState:active {
  background-color: #e5e5e5;
}
.abcRioButtonWorkingState .abcRioButtonWorkingWrapper,
.abcRioButtonErrorState .abcRioButtonErrorWrapper {
  display: block;
}
.abcRioButtonErrorState .abcRioButtonContentWrapper,
.abcRioButtonWorkingState .abcRioButtonContentWrapper,
.abcRioButtonErrorState .abcRioButtonWorkingWrapper {
  display: none;
}
.-webkit-keyframes abcRioButtonWorkingIconPathSpinKeyframes {
  0% {
    -webkit-transform: rotate(0);
  }
}
</style>
