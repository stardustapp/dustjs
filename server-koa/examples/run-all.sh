#!/bin/sh -ex
cd "$(dirname $0)"

node echo-server.js --one-shot
node time-server.js --one-shot

echo "All passed"
