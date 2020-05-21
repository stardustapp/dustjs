"use strict";

// import * as Skylink from '@dustjs/skylink';

import * as Constants from './constants.js';
import * as Skychart from './skychart.js';

import * as DataSubsBase from './data/subs/_base.js';
import * as DataSubsFlat from './data/subs/flat.js';
import * as DataSubsRecord from './data/subs/record.js';
import * as DataSubsSingle from './data/subs/single.js';
import * as DataChannel from './data/channel.js';

import * as OrbiterMountsSkylink from './orbiter/mounts/skylink.js';
import * as OrbiterLaunchpad from './orbiter/launchpad.js';
import * as OrbiterMountTable from './orbiter/mount-table.js';
import * as OrbiterOrbiter from './orbiter/orbiter.js';

import * as SkylinkTransportsHttp from './skylink/transports/http.js';
import * as SkylinkTransportsWs from './skylink/transports/ws.js';
import * as SkylinkClient from './skylink/client.js';
import * as SkylinkNsConvert from './skylink/ns-convert.js';

export default {
  // sss: Skylink,
  ...Constants,
  ...Skychart,
  ...DataSubsBase,
  ...DataSubsFlat,
  ...DataSubsRecord,
  ...DataSubsSingle,
  ...DataChannel,
  ...OrbiterMountsSkylink,
  ...OrbiterLaunchpad,
  ...OrbiterMountTable,
  ...OrbiterOrbiter,
  ...SkylinkTransportsHttp,
  ...SkylinkTransportsWs,
  ...SkylinkClient,
  ...SkylinkNsConvert,
};
