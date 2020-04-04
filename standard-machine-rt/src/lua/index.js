const fengari = require('fengari');
const {luaconf, lua, lauxlib, lualib} = fengari;

//require('./loader.js');
const {LuaMachine} = require('./lua.js');

const LUA_API = {

  // ctx.log(messageParts string...)
  log(L, T) {
    const n = lua.lua_gettop(L);
    const parts = new Array(n);
    for (let i = 0; i < n; i++) {
      const type = lua.lua_type(L, i+1);
      switch (type) {
      case lua.LUA_TSTRING:
        parts[i] = fengari.to_jsstring(lauxlib.luaL_checkstring(L, i+1));
        break;
      case lua.LUA_TNUMBER:
        parts[i] = lauxlib.luaL_checknumber(L, i+1);
        break;
      case lua.LUA_TUSERDATA:
        const device = lauxlib.luaL_checkudata(L, i+1, "stardust/root").root.baseUri;
        parts[i] = device;
        break;
      default:
        parts[i] = `[lua ${fengari.to_jsstring(lua.lua_typename(L, type))}]`;
      }
    }
    lua.lua_settop(L, 0);

    console.log("debug log:", ...parts);
    T.log({text: parts.join(' '), level: 'info'});
    return 0;
  },

  // ctx.sleep(milliseconds int)
  async sleep(L, T) {
    // TODO: support interupting to abort

    const ms = lauxlib.luaL_checkinteger(L, 1);
    lua.lua_pop(L, 1);
    //p.Status = "Sleeping: Since " + time.Now().Format(time.RFC3339Nano);
    //time.Sleep(time.Duration(ms) * time.Millisecond);

    T.startStep({text: `sleeping`});
    function sleep(ms) {
      return new Promise(resolve =>
        setTimeout(resolve, ms));
    }
    await sleep(ms);
    T.endStep();

    return 0;
  },

  // ctx.timestamp() string
  timestamp(L, T) {
    lua.lua_pushliteral(L, (new Date()).toISOString());
    return 1;
  },

  // ctx.splitString(fulldata string, knife string) []string
  splitString(L, T) {
    const str = lua.lua_tojsstring(L, 1);
    const knife = lua.lua_tojsstring(L, 2);
    lua.lua_settop(L, 0);

    lua.lua_newtable(L);
    const parts = str.split(knife);
    for (let i = 0; i < parts.length; i++) {
      lua.lua_pushliteral(L, parts[i]);
      lua.lua_rawseti(L, 1, i + 1);
    }
    return 1;
  },
};

async function boot() {
  try {
    const machine = new LuaMachine({todo:true}, LUA_API);
    const thread = machine.startThread();
    thread.compile('ctx.log(ctx.timestamp())');
    await thread.run();
  } catch (err) {
    console.error();
    console.error(err.stack);
    process.exit(1);
  }
}
setImmediate(boot)
