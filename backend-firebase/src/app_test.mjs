import fetch from 'node-fetch';
import {exit} from 'process';

export default async function(origin) {
  const resp = await fetch(`${origin}~~export`, {
    method: 'POST',
    body: JSON.stringify({
      Op: 'enumerate',
      Path: '/sessions/jGSFq01PvjgltavvioUS/mnt/persist/irc/networks/freenode',
      Depth: 2,
    }),
    headers: {
      'content-type': 'application/json',
    },
  });

  const {Ok, Output} = await resp.json();
  console.log();
  if (Ok) {
    console.log('Test passed:', Output);
    exit(0);
  } else {
    console.log(`Test failed: ${Output.StringValue}`);
    exit(1);
  }
};
