<template>
  <aside id="left-menu"
      @transitionend="transitionend"
      @click="click">
    <nav id="navbar">
      <slot />
    </nav>
  </aside>
</template>

<script>
export default {
  props: {
    fixedWidth: Number,
  },
  methods: {
    transitionend(evt) {
      if (evt.pseudoElement === '::after') {
        //console.log('done transitioning BG');
        this.$el.classList.remove('animate');
      } else {
        //console.log('done moving menu');
        this.$el.style.transitionDuration = '';
        this.$el.style.transitionDelay = '';
        this.needsCooldown = false;
      }
    },

    click(evt) {
      if (evt.offsetX <= this.width) return;
      if (!this.$el.classList.contains('open')) return;
      if (this.needsCooldown) return;
      console.log('BG was clicked w/ menu open, closing menu');
      window.evt=evt;

      this.$el.classList.add('animate');
      this.$el.classList.remove('moving');
      this.$el.classList.remove('open');
    },
  },

  mounted() {
    const el = this.$el;
    var currentPan = null;
    var wasOpen = false;
    this.width = this.fixedWidth || 250;
    this.needsCooldown = false;

    var mc = new Hammer.Manager(el, {
      recognizers: [
        [ Hammer.Pan, {
          direction: Hammer.DIRECTION_HORIZONTAL,
          threshold: 25,
        }],
      ],
    });

    mc.on('panstart', (evt) => {
      // shield against buggy scroll-within-sidenav behavior
      // where every other scroll causes erroneous panning
      if (!evt.velocityX) {
        console.log('Sidenav refusing pan start event without X velocity', currentPan);
        return;
      }

      console.log(this.width, el.offsetLeft, Math.round(evt.center.x), this.width + el.offsetLeft - Math.round(evt.center.x));
      currentPan = this.width + el.offsetLeft - Math.round(evt.center.x);
      el.classList.remove('animate');
      wasOpen = el.classList.contains('open');
      el.classList.add('moving');
    });

    mc.on('pan', (evt) => {
      if (currentPan != null) {
        var offset = Math.round(evt.center.x) + currentPan - this.width;
        //console.log('panning', Math.round(evt.center.x), currentPan, this.width, offset);
        if (offset > (-this.width/2)) {
          el.classList.add('open');
        } else {
          el.classList.remove('open');
        }
        if (offset > 0) {
          offset = Math.round(Math.sqrt(offset) * 2);
        }
        return el.style.left = offset + 'px';
      }
    });

    mc.on('panend', (evt) => {
      var adjustedOffset, currentX, delayMillis, deltaX, durationMillis, nowOpen, offset, remainingTime, targetX, velocityX, wantedSpeed;
      if (currentPan != null) {
        offset = Math.round(evt.center.x) + currentPan - this.width;
        adjustedOffset = offset + Math.round(Math.sqrt(evt.velocityX * 50) * (this.width / 10));
        nowOpen = adjustedOffset > (-this.width/2);
        targetX = nowOpen ? (el.classList.add('open'), 0) : (el.classList.remove('open'), -this.width);
        currentX = parseInt(el.style.left||'0');
        deltaX = targetX - currentX;
        if (deltaX === 0) {
          el.classList.remove('moving');
          el.style.left = '';
          currentPan = null;
          return;
        }
        velocityX = Math.round(evt.velocityX * this.width);
        durationMillis = 1000;
        if (Math.abs(velocityX) < 1) {
          if (deltaX > 0 && wasOpen === false && nowOpen === true) {
            wantedSpeed = 2;
          } else if (deltaX < 0 && wasOpen === true && nowOpen === false) {
            wantedSpeed = -2;
          } else {
            console.log('no animation,', velocityX);
            el.classList.add('animate');
            el.classList.remove('moving');
            el.style.left = '';
            currentPan = null;
            return;
          }
        } else {
          wantedSpeed = velocityX / durationMillis * 6;
          if (Math.abs(wantedSpeed) < 3) {
            wantedSpeed = 3 * (wantedSpeed / Math.abs(wantedSpeed));
          }
        }
        if (deltaX > 0 && wantedSpeed < 0) {
          console.log('speed is not right, not warping time');
        } else if (deltaX < 0 && wantedSpeed > 0) {
          console.log(deltaX, wantedSpeed);
          console.log('speed is not left, not warping time');
        } else {
          remainingTime = deltaX / wantedSpeed * 4;
          if (remainingTime > durationMillis / 2) {
            remainingTime = durationMillis / 2;
          }
          delayMillis = durationMillis - remainingTime;
          console.log('going from', currentX, 'to', targetX, 'needs', deltaX, '- at', wantedSpeed, 'speed,', 'skipping', delayMillis, 'millis of', durationMillis, 'leaving', remainingTime, 'millis');
          el.style.transitionDuration = durationMillis + 'ms';
          el.style.transitionDelay = -delayMillis + 'ms';
        }
        el.classList.add('animate');
        el.classList.remove('moving');
        el.style.left = '';
        currentPan = null;
        this.needsCooldown = true; // let it finish opening before we make closing easy
      }
    });

    mc.on('pancancel', (evt) => {
      currentPan = null;
      el.classList.add('animate');
      el.classList.remove('moving');
      el.style.left = '';
      if (wasOpen) {
        el.classList.add('open');
      } else {
        el.classList.remove('open');
      }
    });
  },
  /*
  'click aside a': (evt) ->
    aside = $(evt.target).closest 'aside'
    if aside.hasClass 'open'
      aside.addClass 'animate'
      aside.removeClass 'open'
  });
  */
};
</script>

<style>
  @media (max-width: 599px) {
    a.menu i {
      color: #fff;
      font-size: 1.5em;
      margin-right: 0.5em;
    }

    #app {
      position: relative;
      overflow-x: hidden;
    }

    aside {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 250px;
      left: -250px;
      z-index: 5;
      transform: translateZ(0);
    }
    nav {
      touch-action: pan-y;
      /* some overflow for animating */
      padding-left: 250px;
      margin-left: -250px;
    }
    aside.animate {
      transition: left 0.2s;
    }
    aside.open {
      left: 0;
    }

    aside::after {
      content: ' ';
      position: absolute;
      bottom: 0;
      top: 0;
      left: 250px;
      width: 15px;

      background-color: rgba(0,0,0,0);
      transition: background-color 0.5s;
    }
    aside.open::after {
      width: auto;
      right: -1000px;
      background-color: rgba(0,0,0,0.4);
    }
    aside.moving::after {
      width: auto;
      right: -1000px;
      background-color: rgba(0,0,0,0.25);
    }
    aside.animate::after {
      width: auto;
      right: -1000px;
    }
  }
  @media (min-width: 600px) {
    a.menu { display: none; }

    nav {
      overflow: auto;
    }
  }


  #left-menu {
    display: flex;
    flex-direction: column;
    flex-basis: 12em;
  }
  #navbar { /* TODO: rename */
    display: flex;
    flex-direction: column;
    overflow-y: scroll;
    /* background-color: #fff; */
    min-height: 100%;
  }
  .list-bar {
    display: flex;
    flex-direction: column;
    overflow-y: scroll;
    min-height: 100%;
  }


  #navbar h2, .list-bar h2 {
    margin: 0.8em 0.6em 0.3em;
    font-size: 1.3em;
    text-transform: uppercase;
    font-weight: 300;
  }

  #navbar ul, .list-bar ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  #navbar li a, .list-bar li a {
    color: inherit;
    text-decoration: none;
    display: block;
    padding: 0.3em 0.8em 0.3em 0.5em;
  }
  #navbar li a:hover, .list-bar li a:hover {
    background-color: rgba(0, 0, 0, 0.3);
  }


  i.clickable {
    cursor: pointer;
  }
</style>
