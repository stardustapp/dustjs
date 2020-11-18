// import * as flags from "https://deno.land/std@0.78.0/flags/mod.ts";

import { cmdApply } from './src/cmd-apply.ts';
import { cmdServe } from './src/cmd-serve.ts';

const [mode, ...args] = Deno.args;
switch (mode) {

  case 'apply': {
    await cmdApply(args);
    break;
  };

  case 'serve': {
    await cmdServe(args);
    break;
  };

  default: {
    console.log('commands:');
    console.log('  dust-deployer apply: roll out changes to the cloud');
    console.log('  dust-deployer serve: launch development server on localhost');
    // TODO: more
    Deno.exit(6);
  };
}
