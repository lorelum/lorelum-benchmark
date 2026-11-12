'use strict';
function migrate(config) {
  const { host, port, logLevel, server = {}, logging = {}, features = {}, ...rest } = config;
  return {
    ...rest,
    version: 2,
    server: { ...server, host: host ?? server.host ?? '127.0.0.1', port: port ?? server.port ?? 3000 },
    logging: { ...logging, level: logLevel ?? logging.level ?? 'info' },
    features: { ...features },
  };
}
module.exports = { migrate };
