<template>
  <component :is="el || 'div'" ref="log">
    <slot name="header" />
    <slot
      v-for="(entry, idx) in entries"
      :name="entry.slot"
      v-bind="entry.props"
      :mergeUp="canMerge(idx - 1, entry)"
    ></slot>

    <li class="new-unread-below" v-if="unseenCount > 0" @click="scrollDown">
      {{ unseenCount }} new messages below 👇
    </li>
  </component>
</template>

<script>
import { LazyBoundSequenceBackLog } from "./lazy-bound-sequence-back-log.js";

export default {
  props: {
    path: String,
    el: String,
    partitions: String,
    latestSeenId: String,
    enableNotifs: Boolean,
  },
  data: () => ({
    horizonPart: null,
    newestPart: null,
    loadedParts: [],
    entries: [], // passed to vue
    nonce: null,
    unseenCount: 0,
    historyDry: false,
    isAtBottom: true,
    historyLoading: true,
  }),
  computed: {
    latestPart() {
      return this.latestPartSub && this.latestPartSub.val;
    },
    latestSeenEnt() {
      return this.entries.find((x) => x.fullId == this.latestSeenId);
    },
  },
  watch: {
    path(path) {
      this.switchTo(path);
    },
    latestSeenEnt(newEnt) {
      if (!this.seenDivider) {
        this.seenDivider = {
          id: "seen-divider",
          slot: "marker",
          props: {
            text: "new messages",
          },
        };
      }

      const curIdx = this.entries.indexOf(this.seenDivider);
      var newIdx = this.entries.indexOf(newEnt);
      console.log("updating seen divider", curIdx, newIdx);
      if (curIdx == newIdx + 1) return;

      if (curIdx != -1) {
        this.entries.splice(curIdx, 1);
      }

      newIdx = this.entries.indexOf(newEnt);
      if (newIdx != -1 && newIdx + 1 < this.entries.length) {
        this.entries.splice(newIdx + 1, 0, this.seenDivider);
      }
    },
  },
  created() {
    window.skylinkP.then(() => this.switchTo(this.path));
    this.scrollTimer = setInterval(this.scrollTick.bind(this), 1000);

    if (this.enableNotifs && Notification.permission === "default") {
      Notification.requestPermission();
    }
  },
  destroyed() {
    clearInterval(this.scrollTimer);
    this.loadedParts.forEach((x) => x.stop());
    this.latestPartSub.stop();
    if (this.latestNotif) {
      this.latestNotif.close();
    }
  },
  beforeUpdate() {
    //console.log('before update', this.$el.clientHeight, this.$el.scrollHeight);
    this.prevScrollHeight = this.$el.scrollHeight;

    // don't muck with this while loading (for initial load)
    if (!this.historyLoading) {
      const bottomTop = this.$el.scrollHeight - this.$el.clientHeight;
      //console.log('bottomTop', bottomTop, 'scrollTop', this.$el.scrollTop);
      this.isAtBottom = bottomTop <= this.$el.scrollTop + 2; // fudge for tab zoom
      //console.log(bottomTop, this.$el.scrollTop, this.isAtBottom);
    }
  },
  updated() {
    //console.log('updated', this.$el.clientHeight, this.prevScrollHeight, this.$el.scrollHeight);
    const deltaHeight = this.prevScrollHeight - this.$el.scrollHeight;
    if (this.prevScrollHeight != this.$el.scrollHeight) {
      if (this.isAtBottom) {
        //console.log('scrolling down');
        this.$el.scrollTop = this.$el.scrollHeight - this.$el.clientHeight;
        this.unseenCount = 0;
      } else {
        if (Math.abs(deltaHeight) < 25 && this.$el.scrollTop < 3000) {
          //console.log('fudging scrollTop to adjust for message load, delta', deltaHeight);
          this.$el.scrollTop -= deltaHeight;
          // if it's small, just go with it
          // important when loading messages in
        }
        //if (this.newestSeenMsg != this.entries.slice(-1)[0]) {
        //const newMsgs = this.entries.length - this.entries.indexOf(this.newestSeenMsg)
        //this.unseenCount += newMsgs;
        //}
      }
    }
    this.newestSeenMsg = this.entries.slice(-1)[0];
  },
  methods: {
    switchTo(path) {
      // shut down previous subs
      if (this.latestPartSub) {
        this.loadedParts.forEach((x) => x.stop());
        this.latestPartSub.stop();
      }

      this.horizonPart = null;
      this.newestPart = null;
      this.latestPartSub = null;
      this.loadedParts = [];
      this.entries = [];
      this.unseenCount = 0;
      this.historyDry = false;
      this.historyLoading = true;
      this.isAtBottom = true;
      const nonce = ++this.nonce;

      if (this.latestNotif) {
        this.latestNotif.close();
        this.latestNotif = null;
      }

      // TODO: fetch subs from cache
      console.log("updating sky-infinite-timeline-log to", path);

      const horizonP = skylink.loadString("/" + path + "/horizon");
      const latestSubP = skylink
        .subscribe("/" + path + "/latest", { maxDepth: 0 })
        .then((chan) => new DustClient.SingleSubscription(chan));
      Promise.all([horizonP, latestSubP]).then(([horizon, latestSub]) => {
        if (this.nonce !== nonce) {
          console.warn(
            "sky-infinite-timeline-log init on",
            path,
            "became ready, but was cancelled, ignoring"
          );
          return;
        }

        this.horizonPart = horizon;
        this.latestPartSub = latestSub;
        console.log(
          path,
          "- newest",
          this.latestPartSub.api.val,
          ", horizon",
          this.horizonPart
        );

        latestSub.forEach((partId) => this.startLivePart(partId));
      });
    },
    // oldest part must be ready. promises to successfully load exactly n older messages.
    requestMessages(n) {
      const part = this.loadedParts[0];
      const m = part.request(n);
      if (m < n) {
        const remainder = n - m;
        console.log(
          "log part only gave",
          m,
          "messages, want",
          remainder,
          "more"
        );

        if (part.id > this.horizonPart) {
          const prevPartId = moment
            .utc(part.id, "YYYY-MM-DD")
            .subtract(1, "day")
            .format("YYYY-MM-DD");

          console.log("adding older part", prevPartId);
          const prevPart = new LazyBoundSequenceBackLog(
            prevPartId,
            this.path + "/" + prevPartId,
            this.entries,
            0,
            "backfill"
          );
          this.loadedParts.unshift(prevPart);

          this.historyLoading = true;
          return prevPart.readyPromise.then(() => {
            console.log(
              "older part",
              prevPart.id,
              "is ready, asking for remainder of",
              remainder
            );
            return this.requestMessages(remainder);
          });
        } else {
          this.historyDry = true;
          return Promise.reject(
            `Entire log ran dry with ${remainder} entries still desired of ${n}`
          );
        }
      } else {
        console.log("the request of", n, "entries has been satisfied");
        return Promise.resolve();
      }
    },
    startLivePart(partId) {
      // check if this is a part that just appeared
      var mode = "initial";
      if (this.newestPart) {
        if (this.newestPart === partId) {
          console.warn("ignoring repeat part announcement", partId);
          return;
        }
        mode = "bleeding-edge";
      }

      console.log("Starting live partition", partId);
      const part = new LazyBoundSequenceBackLog(
        partId,
        this.path + "/" + partId,
        this.entries,
        -1,
        mode
      );
      this.loadedParts.push(part);
      this.newestPart = partId;

      part.onNewItem = this.handleNewItem.bind(this);

      // If this is the first part, start loading in backlog
      // TODO: something else can probably be requesting backlog
      if (this.loadedParts.length == 1) {
        part.readyPromise.then(() => {
          // requesting is blocking/sync
          console.log("loading initial block of backlog");
          this.requestMessages(20).then(() => (this.historyLoading = false));
        });
      }
    },

    scrollTick() {
      // load more, indefinitely
      if (
        this.$el.scrollTop < 2500 &&
        !(this.historyLoading || this.historyDry)
      ) {
        this.historyLoading = true;
        const { scrollTop, scrollHeight } = this.$el;
        console.log("infinite loader is loading more history");
        this.requestMessages(20).then(() => {
          this.historyLoading = false;
          const heightDiff = this.$el.scrollHeight - scrollHeight;
          //console.log('infinite scroll changed height by', heightDiff, '- scrolltop was', scrollTop, this.$el.scrollTop);
          // scroll if still in loader zone
          if (this.$el.scrollTop < 2500) {
            this.$el.scrollTop = scrollTop + heightDiff;
            //console.log('scroll top is 2 now', this.$el.scrollTop);
            setTimeout(() => {
              this.$el.scrollTop = scrollTop + heightDiff;
              //console.log('scroll top is 3 now', this.$el.scrollTop);
            }, 10);
          }
        });

        // also detect things quickly in case of crossing a partition
        const heightDiff = this.$el.scrollHeight - scrollHeight;
        //console.log('infinite scroll changed height by', heightDiff, '- scrolltop was', scrollTop, this.$el.scrollTop);
        // scroll if still in loader zone
        if (this.$el.scrollTop < 2500) {
          this.$el.scrollTop = scrollTop + heightDiff;
          //console.log('scroll top is 1 now', this.$el.scrollTop);
        }
      }

      const bottomTop = this.$el.scrollHeight - this.$el.clientHeight;
      this.isAtBottom = bottomTop <= this.$el.scrollTop + 2; // fuzz for tab zoom
      if (this.isAtBottom && document.visibilityState === "visible") {
        this.$el.scrollTop = bottomTop;
        //console.log('at bottom, resetting scrollTop to', bottomTop);
        this.unseenCount = 0;
        this.offerLastSeen(this.entries.slice(-1)[0]);
      }
    },
    scrollDown() {
      console.log("setting scrolltop in scrollDown()");
      this.$el.scrollTop = this.$el.scrollHeight - this.$el.clientHeight;
      this.unseenCount = 0;
    },

    offerLastSeen(ent) {
      if (!ent || !ent.fullId) return;

      const isGreater = function (a, b) {
        if (!a) return false;
        if (!b) return true;
        [aDt, aId] = a.split("/");
        [bDt, bId] = b.split("/");
        if (aDt > bDt) return true;
        if (aDt < bDt) return false;
        if (+aId > +bId) return true;
        return false;
      };

      if (isGreater(ent.fullId, this.latestSeenId)) {
        this.$emit("newLastSeen", ent.fullId);
      }
    },

    canMerge(idx, latter) {
      const former = this.entries[idx];
      if (former && former.mergeKey && latter.mergeKey) {
        return former.mergeKey == latter.mergeKey;
      }
      return false;
    },

    async handleNewItem(part, msgId, promise) {
      if (this.isAtBottom && !document.hidden)
        if (document.hidden === null || !document.hidden) return;

      this.unseenCount++;

      if (
        this.enableNotifs &&
        this.unseenCount &&
        Notification.permission === "granted"
      ) {
        const context = this.path.split("/").slice(3, 6).join(" ");
        this.latestNotif = new Notification(`Activity in ${context}`, {
          //icon: 'http://cdn.sstatic.net/stackexchange/img/logos/so/so-icon.png',
          body: `${this.unseenCount} new message${
            this.unseenCount == 1 ? "" : "s"
          }`,
          tag: this.path,
        });
        this.latestNotif.onclick = function () {
          window.focus();
          this.close();
          //window.open("http://stackoverflow.com/a/13328397/1269037");
        };
      }

      const entry = await promise;
      console.log("Got new entry", msgId, entry);
    },
  },
};
</script>

<style>
.new-unread-below {
  background-color: #444;
  padding: 0.2em 1em;
  cursor: pointer;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}
</style>
