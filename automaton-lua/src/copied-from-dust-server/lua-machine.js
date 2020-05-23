const fengari = require('fengari');
const {luaconf, lua, lauxlib, lualib} = fengari;

const {FolderEntry, StringEntry, DeviceEntry} = require('@dustjs/skylink');

const {LUA_API} = require('./lua-api.js');
const {TraceContext} = require('./tracing.js');

class LuaContext {
  constructor(L, rootDevice) {
    this.lua = L;
    this.rootDevice = rootDevice;
  }

  compileLuaToStack(T, sourceText) {
    T.startStep({name: 'Lua loadstring', bytes: sourceText.length});

    const compileRes = lauxlib.luaL_loadstring(this.lua, fengari.to_luastring(sourceText));
    if (compileRes !== lua.LUA_OK) {
      const error = lua.lua_tojsstring(this.lua, -1);
      T.endStep();
      throw new Error('Lua compile fault. ' + error);
    }

    T.endStep();
  }

  readLuaEntry(T, index) {
    const L = this.lua;
    switch (lua.lua_type(L, index)) {

    case lua.LUA_TNIL:
      return null;

    case lua.LUA_TSTRING:
      return new StringEntry("string",
        lua.lua_tojsstring(L, index));

    case lua.LUA_TNUMBER:
      return new StringEntry("number",
        lua.lua_tonumber(L, index).toString());

    case lua.LUA_TBOOLEAN:
      return new StringEntry("boolean",
        lua.lua_toboolean(L, index) ? 'yes' : 'no');

    case lua.LUA_TUSERDATA:
      // base.Context values are passed back by-ref
      // TODO: can have a bunch of other interesting userdatas
      const device = lauxlib.luaL_checkudata(L, index, "stardust/root").root;
      return new DeviceEntry("context", device);

    case lua.LUA_TTABLE:
      // Tables become folders
      lua.lua_pushvalue(L, index);
      const folder = new FolderEntry("input");
      lua.lua_pushnil(L); // Add nil entry on stack (need 2 free slots).
      while (lua.lua_next(L, -2)) {
        const entry = this.readLuaEntry(T, -1);
        entry.Name = lua.lua_tojsstring(L, -2);
        lua.lua_pop(L, 1); // Remove val, but need key for the next iter.
        folder.append(entry);
      }
      lua.lua_pop(L, 1);
      return folder;

    default:
      lauxlib.luaL_error(L, `Stardust received unmanagable thing of type ${lua.lua_typename(L, index)}`);
      throw new Error("unreachable");
    }
  }

  pushDeviceReference(T, device) {
    const L = this.lua;
    if (device == null || typeof device.getEntry !== 'function') {
      return lauxlib.luaL_error(L, `BUG: pushDeviceReference wants something with getEntry()`);
    }

    const data = lua.lua_newuserdata(L, 0);
    data.root = device;

    lauxlib.luaL_getmetatable(L, 'stardust/root');
    lua.lua_setmetatable(L, -2);
  }

  pushLiteralEntry(T, entry) {
    const L = this.lua;
    if (entry == null) {
      lua.lua_pushnil(L);
      return;
    }

    switch (entry.Type) {
      case 'Folder':
        this.pushLuaTable(T, entry);
        break;
      case 'String':
        lua.lua_pushliteral(L, entry.StringValue || '');
        break;
      case 'Unknown':
        lua.lua_pushnil(L);
        break;
      default:
        lauxlib.luaL_error(L, `Directory entry ${entry.Name} wasn't a recognizable type ${entry.Type}`);
        throw new Error("unreachable");
    }
  }

  pushLuaTable(T, folder) {
    const L = this.lua;
    lua.lua_newtable(L);
    for (const child of (folder.Children || [])) {
      this.pushLiteralEntry(T, child);
      lua.lua_setfield(L, -2, fengari.to_luastring(child.Name));
    }
  }

  // Reads all the lua arguments and resolves a context for them
  // Reads off stack like: [base context,] names...
  resolveLuaPath(T) {
    T.startStep({name: 'Resolve tree-path'});
    const L = this.lua;

    // Discover the (optional) context at play
    let device = this.rootDevice;
    if (lua.lua_isuserdata(L, 1)) {
      device = lauxlib.luaL_checkudata(L, 1, "stardust/root").root;
      lua.lua_remove(L, 1);
      T.log({text: 'Processed arbitrary root'});
    }

    // Read in the path strings
    const n = lua.lua_gettop(L);
    const paths = new Array(n);
    for (let i = 0; i < n; i++) {
      paths[i] = encodeURIComponent(fengari.to_jsstring(lauxlib.luaL_checkstring(L, i+1)));
    }
    lua.lua_settop(L, 0);

    // Give deets
    const path = (n === 0) ? '' : ('/' + paths.join('/'));
    T.endStep({text: 'Built path', path});
    return {device, path};
  }
}

class LuaMachine extends LuaContext {
  constructor(rootDevice) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);

    super(L, rootDevice);
    this.name = 'lua';
    this.nextThreadNum = 1;
    this.threads = new Map;
    this.luaThreads = new Map;

    lauxlib.luaL_newmetatable(this.lua, "stardust/api");
    for (const callName in LUA_API) {
      // TODO: should be a lambda, w/ an upvalue
      const impl = L => {
        const thread = this.luaThreads.get(L);
        const argCount = lua.lua_gettop(L);
        const T = thread.traceCtx.newTrace({name: callName, callName, argCount});
        thread.T = T; // TODO

        lauxlib.luaL_traceback(L, L, `Calling ctx.${callName}()`, 1);
        T.originalStack = lua.lua_tojsstring(L, -1);
        lua.lua_pop(L, 1);

        lua.lua_pushliteral(L, callName);
        lua.lua_yield(L, argCount+1);
      };
      lua.lua_pushjsfunction(this.lua, impl);
      lua.lua_setfield(this.lua, -2, callName);
    }
    lua.lua_setglobal(this.lua, 'ctx');

    // Make a type marker for native devices (including Environment)
    lauxlib.luaL_newmetatable(this.lua, "stardust/root");
    // attach our API to metdata __index
    // TODO: maybe a reduced version of the API?
    lauxlib.luaL_getmetatable(L, 'stardust/api');
    lua.lua_setfield(this.lua, -2, "__index");
    // get rid of the metadata for now
    lua.lua_pop(this.lua, 1);
  }

  startThread(sourceText) {
    console.debug("Starting lua thread");
    const threadNum = this.nextThreadNum++;
    const thread = new LuaThread(this, threadNum);
    this.threads.set(threadNum, thread);
    this.luaThreads.set(thread.lua, thread);
    return thread;
  }
}

class LuaThread extends LuaContext {
  constructor(machine, number) {
    // start tracing before we even create the lua context
    const threadName = `${machine.name}-#${number}`
    const traceCtx = new TraceContext(threadName);
    const T = traceCtx.newTrace({name: 'lua setup'});

    super(lua.lua_newthread(machine.lua), machine.rootDevice);
    this.machine = machine;
    this.number = number;
    this.name = threadName;
    this.traceCtx = traceCtx;
    this.status = 'Idle';

    this.createEnvironment(T);
    T.end();
  }

  createEnvironment(T) {
    T.startStep({name: 'create environment'});
    const L = this.lua;
    lua.lua_createtable(L, 0, 1);

    const copiedGlobals = ['tonumber', 'tostring', 'type', 'string', 'math', 'pairs', 'ipairs', 'ctx', 'assert', 'error', 'table'];
    for (const name of copiedGlobals) {
      lua.lua_getglobal(L, name);
      lua.lua_setfield(L, -2, fengari.to_luastring(name));
    }

    lua.lua_pushjsfunction(L, L => {
      const input = lua.lua_tojsstring(L, -1);
      lua.lua_pop(L, 1);
      lua.lua_pushliteral(L, encodeURIComponent(input));
      return 1;
    });
    lua.lua_setfield(L, -2, 'encodeURIComponent');

    lua.lua_pushjsfunction(L, L => {
      const input = lua.lua_tojsstring(L, -1);
      lua.lua_pop(L, 1);
      lua.lua_pushliteral(L, decodeURIComponent(input));
      return 1;
    });
    lua.lua_setfield(L, -2, 'decodeURIComponent');

    lua.lua_getglobal(L, 'ctx');
    lua.lua_getfield(L, -1, 'log');
    lua.lua_remove(L, -2);
    lua.lua_setfield(L, -2, fengari.to_luastring('print'));

    lua.lua_pushliteral(L, this.number.toString());
    lua.lua_setfield(L, -2, fengari.to_luastring('thread_number'));

    // take a proxy but otherwise scrap it
    this.luaEnv = lua.lua_toproxy(L, -1);
    lua.lua_pop(L, 1);
    T.endStep();
  }

  compileFrom(sourceEntry) {
    // const encodedBytes = base64js.toByteArray(sourceEntry.Data);
    // const sourceText = new TextDecoder('utf-8').decode(encodedBytes);
    const sourceText = Buffer.from(sourceEntry.Data, 'base64').toString('utf-8');
    this.compile(sourceText);
  }

  compile(sourceText) {
    if (this.status !== 'Idle')
      throw new Error(`Cannot compile thread while it's ${this.status}`);
    this.status = 'Compiling';

    const T = this.traceCtx.newTrace({name: 'lua compile'});
    const L = this.lua;

    // compile the script
    this.compileLuaToStack(T, sourceText);

    // attach the environment to the loaded string
    this.luaEnv(L);
    lua.lua_setupvalue(L, -2, 1);

    // take a proxy but otherwise scrap it
    this.runnable = lua.lua_toproxy(L, 1);
    this.sourceText = sourceText;
    lua.lua_pop(L, 1);
    T.end();

    this.status = 'Idle';
  }

  registerGlobal(name) {
    const L = this.lua;
    this.luaEnv(L);
    lua.lua_insert(L, -2);
    lua.lua_setfield(L, -2, fengari.to_luastring(name));
    lua.lua_pop(L, 1);
  }

  async run(input) {
    if (this.status !== 'Idle')
      throw new Error(`Cannot run thread while it's ${this.status}`);
    if (!this.runnable)
      throw new Error(`Cannot run thread - no source has been compiled yet`);
    this.status = 'Running';

    const L = this.lua;

    // pretend to update 'input' global properly
    // TODO: T spans whole function run?
    const T = this.traceCtx.newTrace({name: 'load input'});
    this.pushLiteralEntry(T, input);
    this.registerGlobal('input');
    T.end();

    // be a little state machine
    if (this.running)
      throw new Error(`BUG: Lua thread can't start, is already started`);
    this.running = true;

    // stack should just be the function
    if (lua.lua_gettop(L) !== 0)
      throw new Error(`BUG: Lua thread can't start without an empty stack`);
    this.runnable(L);

    try {
      let outputNum = 0;
      while (this.running) {
        const evalRes = lua.lua_resume(L, null, outputNum);
        switch (evalRes) {

        case lua.LUA_OK:
          this.running = false;
          break;

        case lua.LUA_ERRRUN:
          const error = lua.lua_tojsstring(L, -1);
          throw new Error('Lua execution fault (' + error + ')');

        case lua.LUA_YIELD:
          const callName = lua.lua_tojsstring(L, -1);
          const T = this.T; // TODO
          lua.lua_pop(L, 1);

          //checkProcessHealth(l)
          //console.debug('lua api:', callName, 'with', lua.lua_gettop(L), 'args');
          T.startStep({name: 'implementation'});
          try {
            const impl = LUA_API[callName];
            outputNum = await impl.call(this, L, T);
          } catch (err) {
            console.error('BUG: lua API crashed:', err);
            lauxlib.luaL_error(L, `[BUG] ctx.${callName}() crashed`);
          } finally {
            T.endStep();
          }

          // put the function back at the beginning
          this.runnable(L);
          lua.lua_insert(L, 1);
          T.end();
          break;

        default:
          throw new Error(`BUG: lua resume was weird (${evalRes})`);
        }
      }
    } catch (err) {
      const match = err.message.match(/\(\[string ".+?"\]:(\d+): (.+)\)$/);
      if (match) {
        const sourceLine = this.sourceText.split('\n')[match[1]-1].trim();
        throw new Error(`Lua execution fault: ${match[2]} @ line ${match[1]}: ${sourceLine}`);
      }
      throw err;
    } finally {
      this.status = 'Idle';
    }

    console.warn('lua thread completed');
  }
}

module.exports = {
  LuaContext,
  LuaMachine,
  LuaThread,
};
