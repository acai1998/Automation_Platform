const path = require('path');

const target = process.argv[2];

if (!target) {
  console.error('Missing target script path.');
  process.exit(1);
}

process.env.TS_NODE_PROJECT = path.resolve(process.cwd(), 'tsconfig.server.json');

require('ts-node/register');
require('tsconfig-paths/register');

require(path.resolve(process.cwd(), target));
