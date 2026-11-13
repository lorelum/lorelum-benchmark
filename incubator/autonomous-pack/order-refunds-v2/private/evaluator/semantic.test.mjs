import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.WORKSPACE || !path.isAbsolute(process.env.WORKSPACE)) throw new Error('WORKSPACE must be an absolute candidate workspace path');
const workspace = path.resolve(process.env.WORKSPACE);
const name = process.env.LORELUM_EVALUATOR_CONTAINER_NAME || `lorelum-evaluator-${randomUUID()}`;
if (!/^lorelum-evaluator-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(name)) throw new Error('Invalid evaluator container name');
const child = spawn('docker', [
  'run', '--rm', '-i', '--name', name, '--network', 'none', '--read-only',
  '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128',
  '--memory', '512m', '--cpus', '1', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
  '--mount', `type=bind,src=${workspace},dst=/workspace,readonly`,
  '--mount', `type=bind,src=${path.join(here, 'bridge.mjs')},dst=/bridge.mjs,readonly`,
  '--entrypoint', 'node', process.env.LORELUM_EVALUATOR_IMAGE || 'lorelum-autonomous-pack:v1', '/bridge.mjs',
], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
const references = new WeakMap();
let nextId = 0;
let nextService = 0;
let transportError;
function failTransport(error) {
  transportError ||= error;
  for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(transportError); }
  pending.clear();
}
child.on('error', failTransport);
child.on('exit', (code, signal) => failTransport(new Error(`Evaluator container exited (${code ?? signal})`)));
child.stdin.on('error', failTransport);
createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', line => {
  let response;
  try { response = JSON.parse(line); } catch { failTransport(new Error('Invalid bridge response')); return; }
  const entry = pending.get(response.id);
  if (!entry || typeof response.ok !== 'boolean') { failTransport(new Error('Unexpected bridge response')); return; }
  pending.delete(response.id);
  clearTimeout(entry.timer);
  if (entry.isCall && (!response.call || response.call.threwSynchronously !== false || response.call.thenable !== true)) {
    entry.reject(Object.assign(new Error('Candidate method must return a Promise or thenable without throwing synchronously'), { name: 'CandidateError' }));
    return;
  }
  if (!response.ok) {
    entry.reject(Object.assign(new Error(response.error?.message || 'Candidate error'), { code: response.error?.code, name: 'CandidateError' }));
  } else {
    if (response.value && typeof response.value === 'object') references.set(response.value, response.id);
    entry.resolve(response.value);
  }
});
const encode = (_key, value) => typeof value === 'number' && !Number.isFinite(value)
  ? { $number: String(value) } : value;
function request(body) {
  if (transportError) return Promise.reject(transportError);
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => failTransport(new Error('Evaluator bridge request timed out')), 10000);
    pending.set(id, { resolve, reject, timer, isCall: body.op === 'call' });
    child.stdin.write(`${JSON.stringify({ id, ...body }, encode)}\n`);
  });
}
after(() => {
  child.stdin.end();
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 10000 });
  child.kill();
});
function createLedger(orders) {
  const service = ++nextService;
  const ready = request({ op: 'create', service, orders });
  const call = (method, ...args) => ready.then(() => request({ op: 'call', service, method, args }));
  return { getOrder: id => call('getOrder', id), refund: (id, requestId, amount) => call('refund', id, requestId, amount) };
}
const mutate = (value, key, replacement) => request({ op: 'mutate', valueId: references.get(value), key, value: replacement });
const ledger = () => createLedger([{ id: 'a', paid: 100 }, { id: 'b', paid: 75 }, { id: 'zero', paid: 0 }]);
const reject = (promise, code) => assert.rejects(promise, error => error?.code === code);

test('partial refunds, exact remainder, and independent orders', async () => {
  const service = ledger();
  assert.deepEqual(await service.getOrder('a'), { id: 'a', paid: 100, refunded: 0, remaining: 100 });
  assert.deepEqual(await service.refund('a', 'one', 30), { orderId: 'a', requestId: 'one', amount: 30, refunded: 30, remaining: 70 });
  assert.deepEqual(await service.refund('b', 'one', 75), { orderId: 'b', requestId: 'one', amount: 75, refunded: 75, remaining: 0 });
  assert.deepEqual(await service.refund('a', 'two', 70), { orderId: 'a', requestId: 'two', amount: 70, refunded: 100, remaining: 0 });
  await reject(service.refund('a', 'three', 1), 'INSUFFICIENT_BALANCE');
  await reject(service.refund('zero', 'one', 1), 'INSUFFICIENT_BALANCE');
});

test('idempotency preserves original receipt and conflicting reuse is rejected', async () => {
  const service = ledger();
  const first = await service.refund('a', 'x', 20);
  await service.refund('a', 'y', 30);
  assert.deepEqual(await service.refund('a', 'x', 20), first);
  await reject(service.refund('a', 'x', 21), 'IDEMPOTENCY_CONFLICT');
  await reject(service.refund('a', 'x', 90), 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await service.getOrder('a'), { id: 'a', paid: 100, refunded: 50, remaining: 50 });
});

test('validation precedence and unsuccessful attempts leave no reservation', async () => {
  const service = ledger();
  await reject(service.getOrder('missing'), 'ORDER_NOT_FOUND');
  await reject(service.refund('missing', 'x', 0), 'ORDER_NOT_FOUND');
  for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) {
    await reject(service.refund('a', 'x', amount), 'INVALID_AMOUNT');
  }
  await reject(service.refund('a', 'x', 101), 'INSUFFICIENT_BALANCE');
  await service.refund('a', 'x', 10);
  await reject(service.refund('a', 'x', 0), 'INVALID_AMOUNT');
  assert.deepEqual(await service.getOrder('a'), { id: 'a', paid: 100, refunded: 10, remaining: 90 });
});

test('overlapping successful refunds return receipts for a serial order', async () => {
  const service = ledger();
  const [left, right] = await Promise.all([service.refund('a', 'x', 30), service.refund('a', 'y', 40)]);
  const leftFirst = left.refunded === 30 && left.remaining === 70
    && right.refunded === 70 && right.remaining === 30;
  const rightFirst = right.refunded === 40 && right.remaining === 60
    && left.refunded === 70 && left.remaining === 30;
  assert.ok(leftFirst || rightFirst);
  assert.deepEqual(await service.refund('a', 'x', 30), left);
  assert.deepEqual(await service.refund('a', 'y', 40), right);
  assert.deepEqual(await service.getOrder('a'), { id: 'a', paid: 100, refunded: 70, remaining: 30 });
});

test('overlapping requests serialize including duplicate keys', async () => {
  const service = ledger();
  const results = await Promise.allSettled([service.refund('a', 'x', 60), service.refund('a', 'y', 60)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason?.code === 'INSUFFICIENT_BALANCE').length, 1);
  assert.equal((await service.getOrder('a')).refunded, 60);
  const same = ledger();
  const [left, right] = await Promise.all([same.refund('a', 'x', 40), same.refund('a', 'x', 40)]);
  assert.deepEqual(left, right);
  assert.equal((await same.getOrder('a')).refunded, 40);
  const conflict = ledger();
  const outcomes = await Promise.allSettled([conflict.refund('a', 'x', 10), conflict.refund('a', 'x', 20)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected' && result.reason?.code === 'IDEMPOTENCY_CONFLICT').length, 1);
  const winner = outcomes.find(result => result.status === 'fulfilled').value;
  assert.equal((await conflict.getOrder('a')).refunded, winner.amount);
});

test('returned objects cannot modify stored balances or receipts', async () => {
  const service = ledger();
  const receipt = await service.refund('a', 'x', 20);
  await mutate(receipt, 'refunded', 999);
  const view = await service.getOrder('a');
  await mutate(view, 'refunded', 999);
  assert.equal((await service.getOrder('a')).refunded, 20);
  assert.deepEqual(await service.refund('a', 'x', 20), { orderId: 'a', requestId: 'x', amount: 20, refunded: 20, remaining: 80 });
});

test('large safe integer amounts retain exact cent arithmetic', async () => {
  const service = createLedger([{ id: 'big', paid: Number.MAX_SAFE_INTEGER }]);
  const result = await service.refund('big', 'x', Number.MAX_SAFE_INTEGER - 1);
  assert.equal(result.remaining, 1);
  assert.equal((await service.refund('big', 'y', 1)).refunded, Number.MAX_SAFE_INTEGER);
});
