const error = code => Object.assign(new Error(code), { code });

// A per-order promise queue serializes even implementations with asynchronous work.
export function createLedger(orders) {
  const records = new Map(orders.map(({ id, paid }) => [id, { paid, events: [], queue: Promise.resolve() }]));
  const lookup = id => {
    const record = records.get(id);
    if (!record) throw error('ORDER_NOT_FOUND');
    return record;
  };
  const total = record => record.events.reduce ( (sum, event) => sum + event.amount, 0);
  return {
    async getOrder(id) {
      const record = lookup(id);
      await record.queue;
      const refunded = total(record);
      return { id, paid: record.paid, refunded, remaining: record.paid - refunded };
    },
    async refund(orderId, requestId, amount) {
      const record = lookup(orderId);
      const operation = record.queue.then(() => {
        if (!Number.isSafeInteger(amount) || amount <= 0) throw error('INVALID_AMOUNT');
        const existing = record.events.find(event => event.requestId === requestId);
        if (existing) {
          if (existing.amount !== amount) throw error('IDEMPOTENCY_CONFLICT');
          return { ...existing.receipt };
        }
        const refunded = total(record) + amount;
        if (amount > record.paid - total(record)) throw error('INSUFFICIENT_BALANCE');
        const receipt = { orderId, requestId, amount, refunded, remaining: record.paid - refunded };
        record.events.push({ requestId, amount, receipt });
        return { ...receipt };
      });
      record.queue = operation.then(() => undefined, () => undefined);
      return operation;
    },
  };
}
