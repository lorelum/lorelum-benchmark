'use strict';
const readline = require('node:readline');
const { migrate } = require('./migrate');

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', (line) => {
  const { config } = JSON.parse(line);
  process.stdout.write(JSON.stringify({ config: migrate(config) }) + '\n');
});
