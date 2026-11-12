import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';

const cases = [
  [{}, { version: 2, server: { host: '127.0.0.1', port: 3000 }, logging: { level: 'info' }, features: {} }],
  [{ version: 1, host: 'legacy.example', port: 8088, logLevel: 'debug' }, { version: 2, server: { host: 'legacy.example', port: 8088 }, logging: { level: 'debug' }, features: {} }],
  [{ version: 1, host: 'old', port: 81, logLevel: 'warn', server: { host: 'new', port: 82, tls: true }, logging: { level: 'error', format: 'json' }, features: { beta: false } }, { version: 2, server: { host: 'new', port: 82, tls: true }, logging: { level: 'error', format: 'json' }, features: { beta: false } }],
  [{ host: 'old', port: 7000, logLevel: 'debug', server: { host: '', timeout: 0 }, logging: { level: '' }, extra: { nested: [1, { a: false }] } }, { version: 2, server: { host: '', port: 7000, timeout: 0 }, logging: { level: '' }, features: {}, extra: { nested: [1, { a: false }] } }],
  [{ host: 'unused', port: 9000, server: { port: 0 }, logging: { format: 'text' }, features: { items: ['a', 'b'] } }, { version: 2, server: { host: 'unused', port: 0 }, logging: { level: 'info', format: 'text' }, features: { items: ['a', 'b'] } }],
  [{ version: 2, server: { host: 'ready', port: 44, config: { retries: 2 } }, logging: { level: 'trace', sinks: ['x'] }, features: { alpha: true }, unknown: null }, { version: 2, server: { host: 'ready', port: 44, config: { retries: 2 } }, logging: { level: 'trace', sinks: ['x'] }, features: { alpha: true }, unknown: null }],
  [{ version: 3, server: {}, logging: {}, features: {}, zero: 0, enabled: false, empty: '' }, { version: 2, server: { host: '127.0.0.1', port: 3000 }, logging: { level: 'info' }, features: {}, zero: 0, enabled: false, empty: '' }],
];

const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
const lines = reader[Symbol.asyncIterator]();
let nextId = 0;
async function call(config) {
  const id = String(++nextId);
  process.stdout.write(JSON.stringify({ type: 'call', id, input: { config } }) + '\n');
  const line = await lines.next();
  if (line.done) throw new Error('broker closed');
  const reply = JSON.parse(line.value);
  if (!reply || reply.type !== 'reply' || reply.id !== id || !Object.hasOwn(reply, 'output')) {
    throw new Error('invalid broker reply');
  }
  return reply.output;
}

let passed = true;
for (const [input, expected] of cases) {
  const first = await call(input);
  if (!isDeepStrictEqual(first, { config: expected })) {
    passed = false;
    continue;
  }
  const second = await call(first.config);
  if (!isDeepStrictEqual(second, { config: expected })) passed = false;
}
process.stdout.write(JSON.stringify({ type: 'result', semantic: passed ? 'pass' : 'fail' }) + '\n');
reader.close();
