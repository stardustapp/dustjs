import {Elements as DataTree} from '@dustjs/data-tree';

export const config = {
  '/prefs': new DataTree.Document({
    '/layout': String,
    '/disable-nicklist': Boolean,
    '/enable-notifs': Boolean,

    '/userstyle.css': new DataTree.Blob('text/css', 'utf-8'),
  }),

  '/networks': new DataTree.NamedCollection({
    '/auto-connect': Boolean,
    // TODO: convert to string map
    '/channels': [String],
    // '/channels': new DataTree.StringMap({
    //   '/auto-join': Boolean,
    //   '/key': String,
    // }),
    '/full-name': String,
    '/hostname': String,
    '/ident': String,
    '/nickname': String,
    '/nickserv-pass': String,
    '/password': String,
    '/port': Number,
    '/use-tls': Boolean,
    '/username': String,
  }),
};

// Reused by various things that contain IRC logs
const ircPacket = new DataTree.Document({
  // internal usage
  '/source': String, // where the event came from
  '/timestamp': Date, // when the event was observed
  '/is-mention': Boolean, // whether the message should be highlighted
  // for events that weren't ever actual IRC (dialing, etc)
  // TODO: just synthesize fake IRC events lol
  '/sender': String,
  '/text': String,
  // standard IRC protocol fields
  '/prefix-name': String,
  '/prefix-user': String,
  '/prefix-host': String,
  '/command': String,
  '/params': [String],
  // IRCv3 addon metadata
  '/tags': new DataTree.StringMap(String),
});

export const persist = {
  '/wires': new DataTree.NamedCollection({
    '/wire-uri': String,
    '/checkpoint': Number,
  }),

  '/networks': new DataTree.NamedCollection({
    '/avail-chan-modes': String,
    '/avail-user-modes': String,
    '/current-nick': String,
    '/latest-seen': String,
    '/paramed-chan-modes': String,
    '/server-hostname': String,
    '/server-software': String,
    '/umodes': String,

    '/channels': new DataTree.NamedCollection({
      '/is-joined': Boolean,
      '/latest-activity': String,
      '/latest-mention': String,
      '/latest-seen': String,

      '/log': new DataTree.DatePartitionedLog(ircPacket),
      '/members': new DataTree.NamedCollection({
        '/nick': String,
        // TODO: user/host should be stored in a network-central location, alongside account, realname, away, etc
        '/user': String,
        '/host': String,
        '/since': Date,
        '/modes': String,
        '/prefix': String,
      }),
      '/modes': new DataTree.StringMap(String),
      // TODO: collection of topics, keep history
      '/topic': new DataTree.Document({
        '/latest': String,
        '/set-at': Date,
        '/set-by': String,
      }),
    }),

    '/queries': new DataTree.NamedCollection({
      '/latest-activity': String,
      // '/latest-mention': String,
      '/latest-seen': String,

      '/log': new DataTree.DatePartitionedLog(ircPacket),
    }),

    // TODO: graduate into a proper context
    '/mention-log': new DataTree.DatePartitionedLog({
      '/location': String,
      '/sender': String,
      '/text': String,
      '/timestamp': Date,
      // TODO: /raw used to be a hardlink, so maybe also store a firestore ref
      '/raw': ircPacket,
    }, {
      firestorePath: 'logs/mentions',
    }),

    // TODO: graduate into a proper context
    '/server-log': new DataTree.DatePartitionedLog(ircPacket, {
      firestorePath: 'logs/server',
    }),

    '/supported': new DataTree.StringMap(String),
  }),

};
