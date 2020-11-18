// from https://github.com/lemarier/deno-env-paths/blob/master/mod.ts

import {
  join as pathJoin,
  basename as pathBasename,
} from "https://deno.land/std/path/mod.ts";

const homedir: string | undefined = Deno.env.get('HOME');
const tmpdir: string | undefined = Deno.env.get('TMPDIR');

interface IOptions {
  suffix: string;
}

const macos = (name: string) => {
  if (!homedir) {
    throw new Error("Can't extract the home directory.");
  }

  const library = pathJoin(homedir, "Library");

  return {
    data: pathJoin(library, "Application Support", name),
    config: pathJoin(library, "Preferences", name),
    cache: pathJoin(library, "Caches", name),
    log: pathJoin(library, "Logs", name),
    temp: pathJoin(tmpdir || 'tmp', name),
  };
};

const windows = (name: string) => {
  if (!homedir) {
    throw new Error("Can't extract the home directory.");
  }

  if (!tmpdir) {
    throw new Error("Can't extract the tmp directory.");
  }

  const appData = Deno.env.get("APPDATA") ||
    pathJoin(homedir, "AppData", "Roaming");
  const localAppData = Deno.env.get("LOCALAPPDATA") ||
    pathJoin(homedir, "AppData", "Local");

  return {
    data: pathJoin(localAppData, name, "Data"),
    config: pathJoin(appData, name, "Config"),
    cache: pathJoin(localAppData, name, "Cache"),
    log: pathJoin(localAppData, name, "Log"),
    temp: pathJoin(tmpdir, name),
  };
};

const linux = (name: string) => {
  if (!homedir) {
    throw new Error("Can't extract the home directory.");
  }

  const username = pathBasename(homedir);

  return {
    data: pathJoin(
      Deno.env.get("XDG_DATA_HOME") || pathJoin(homedir, ".local", "share"),
      name,
    ),
    config: pathJoin(
      Deno.env.get("XDG_CONFIG_HOME") || pathJoin(homedir, ".config"),
      name,
    ),
    cache: pathJoin(
      Deno.env.get("XDG_CACHE_HOME") || pathJoin(homedir, ".cache"),
      name,
    ),
    log: pathJoin(
      Deno.env.get("XDG_STATE_HOME") || pathJoin(homedir, ".local", "state"),
      name,
    ),
    temp: pathJoin(tmpdir || 'tmp', username, name),
  };
};

export default (name: string, options: IOptions = { suffix: "deno" }) => {
  if (typeof name !== "string") {
    throw new TypeError(`Expected string, got ${typeof name}`);
  }

  // Add suffix to prevent possible conflict with native apps
  if (options.suffix) {
    name += `-${options.suffix}`;
  }

  if (Deno.build.os === "darwin") {
    return macos(name);
  }

  if (Deno.build.os === "windows") {
    return windows(name);
  }

  return linux(name);
};
