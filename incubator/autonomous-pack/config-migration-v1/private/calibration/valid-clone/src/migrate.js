'use strict';
function migrate(config) {
  const result = structuredClone(config);
  const server = result.server || {};
  const logging = result.logging || {};
  if (!Object.hasOwn(server, 'host')) server.host = Object.hasOwn(result, 'host') ? result.host : '127.0.0.1';
  if (!Object.hasOwn(server, 'port')) server.port = Object.hasOwn(result, 'port') ? result.port : 3000;
  if (!Object.hasOwn(logging, 'level')) logging.level = Object.hasOwn(result, 'logLevel') ? result.logLevel : 'info';
  delete result.host;
  delete result.port;
  delete result.logLevel;
  result.version = 2;
  result.server = server;
  result.logging = logging;
  if (!Object.hasOwn(result, 'features')) result.features = {};
  return result;
}
module.exports = { migrate };
