// Generic JSONL adapter. This file contains no evaluator assertions or private cases.
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

console.log = (...args) => console.error(...args);
const { createLedger } = await import(pathToFileURL('/workspace/src/index.js').href);
const services = new Map();
const values = new Map();
const decode = value => {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && value.$number === 'NaN') return NaN;
    if (Object.keys(value).length === 1 && value.$number === 'Infinity') return Infinity;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  }
  return value;
};
const respond = response => process.stdout.write(`${JSON.stringify(response)}\n`);
async function dispatch(request) {
  try {
    let value;
    if (request.op === 'create') {
      services.set(request.service, await createLedger(decode(request.orders)));
    } else if (request.op === 'call') {
      const service = services.get(request.service);
      if (!service || !['refund', 'getOrder'].includes(request.method)) throw new Error('Invalid bridge call');
      value = await service[request.method](...decode(request.args));
      values.set(request.id, value);
    } else if (request.op === 'mutate') {
      if (!values.has(request.valueId)) throw new Error('Unknown bridge value');
      value = Reflect.set(values.get(request.valueId), request.key, decode(request.value));
    } else {
      throw new Error('Invalid bridge operation');
    }
    respond({ id: request.id, ok: true, value });
  } catch (error) {
    respond({ id: request.id, ok: false, error: { code: error?.code, message: String(error?.message ?? error) } });
  }
}
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  try { void dispatch(JSON.parse(line)); }
  catch { process.exitCode = 1; break; }
}
