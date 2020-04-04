const {
  luaconf,
  lua,
  lauxlib,
  lualib,
  load,
} = require('fengari');
const L = lauxlib.luaL_newstate();

lualib.luaL_openlibs(L);

lua.lua_pushliteral(L, "hello world!");
load(`require 'fun'()`)
