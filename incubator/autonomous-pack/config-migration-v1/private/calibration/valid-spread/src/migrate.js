'use strict';
function migrate(config) {
  const { host, port, logLevel, server = {}, logging = {}, features = {}, ...rest } = config;
  return {
    ...rest,
    version: 2,
    server: { ...server, host: server.host ?? host ?? '127.0.0.1', port: server.port ?? port ?? 3000 },
    logging: { ...logging, level: logging.level ?? logLevel ?? 'info' },
    features: { ...features },
  };
}
module.exports = { migrate };
