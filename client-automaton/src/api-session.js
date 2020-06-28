import { SkylinkClientDevice, SkylinkReversalExtension, ChannelExtension, InlineChannelCarrier } from '@dustjs/skylink';

// async function launchUsingIdToken(apiDevice, idToken) {
//   throw new Error(`TODO`);
// }

// TODO: this file should probably be in the common npm module

async function launchUsingAppToken(apiDevice, userId, tokenSecret) {
  const launchEntry = await apiDevice.getEntry('/apptoken-launch/invoke');
  if (!launchEntry || !launchEntry.invoke) throw new Error(
    `Failed to find /apptoken-launch skylink invokable on API device`);

  try {
    const output = await launchEntry.invoke({ Type: "Folder", Children: [
      { Name: "User ID", Type: "String", StringValue: userId },
      { Name: "Token", Type: "String", StringValue: tokenSecret },
    ]});

    if (output.Type !== 'String') throw new Error(
      `launchUsingAppToken got unknown response type "${output.Type}"`);
    return output.StringValue;

  } catch (err) {
    if (!err.response) throw err;
    const out = err.response.Output;
    if (!out || out.Type !== 'String') throw err;
    throw new Error(`Unable to launch API session, server said: ${out.StringValue}`);
  }
}

export class ApiSession {
  constructor(apiDevice, wsDevice, sessionId) {
    this.apiDevice = apiDevice;
    this.wsDevice = wsDevice;
    this.sessionId = sessionId;

    // this.closedDevice = new Promise(resolve => this.markClosedDevice = resolve);
  }

  static async findFromEnvironment(env) {
    // always required, primary server to connect to
    const serverUri = env.AUTOMATON_SERVER_URI;
    // option 1. predefined session to just use as-is
    const fixedSessionId = env.AUTOMATON_SESSION_ID;
    // option 2. credentials to construct ('launch') a new session
    const userId = env.AUTOMATON_USER_ID;
    const tokenSecret = env.AUTOMATON_TOKEN_SECRET;

    if (!serverUri) throw new Error(
      `Export AUTOMATON_SERVER_URI, AUTOMATON_USER_ID, AUTOMATON_TOKEN_SECRET & try again`);
    console.log('    Connecting to API endpoint', serverUri);

    const apiDevice = SkylinkClientDevice.fromUri(serverUri);
    // likely HTTP, so this just performs a ping, not long-running
    await apiDevice.ready;

    let sessionId = null;
    if (fixedSessionId) {
      // Don't mangle existing sessions, just use as-is
      // TODO: perhaps add option to safely 'adopt' the session by
      //       renewing and revoking it like our own sessions
      console.log('!-> WARN: Reusing existing session ID from environment variables');
      sessionId = fixedSessionId;

    } else {
      // start a session with the user's auth server
      console.log('--> Redeeming new App session using a Token for user', userId);
      sessionId = await launchUsingAppToken(apiDevice, userId, tokenSecret);

      // TODO: heartbeat the session hourly or daily
      // TODO: destroy session at process teardown
    }

    console.log('    Establishing Websocket connection to API server...');
    const wsOrigin = serverUri.replace('+http', '+ws');
    const wsDevice = SkylinkClientDevice.fromUri(wsOrigin);
    await wsDevice.ready;

    // allow the api server to perform ops against us
    wsDevice.remote.attach(new SkylinkReversalExtension([
      // allow inline channels from us to the server
      new ChannelExtension(),
      new InlineChannelCarrier(),
    ]));

    // 'Handle' lost connections
    wsDevice.closed.then(() => {
      console.error();
      console.error(`WARN: WebSocket device to API server has been disconnected!!`);
      console.error(`TODO: I will shutdown uncleanly and let this be someone else's problem.`);
      process.exit(12);
      // this.markClosedDevice(wsDevice);
    });

    console.log('    Session established.');
    return new ApiSession(apiDevice, wsDevice, sessionId);
  }

  async createMountDevice(subPath='') {
    const fullPath = `/sessions/${this.sessionId}/mnt${subPath}`;
    return this.wsDevice.getSubRoot(fullPath);
  }
}
