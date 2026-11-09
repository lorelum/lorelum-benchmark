function fail(code) {
  return Object.assign(new Error(code), { code });
}

// A single synchronous state transition is atomic on the JavaScript event loop.
export function makeLedger(orders, defect = '') {
  const rows = new Map(orders.map(({ id, paid }) => [id, { paid, refunded: 0, receipts: new Map() }]));
  function find(id) {
    const row = rows.get(id);
    if (!row) throw fail('ORDER_NOT_FOUND');
    return row;
  }
  return {
    async getOrder(id) {
      const row = find(id);
      return { id, paid: row.paid, refunded: row.refunded, remaining: row.paid - row.refunded };
    },
    async refund(orderId, requestId, amount) {
      const row = find(orderId);
      if (!Number.isSafeInteger(amount) || amount <= 0) throw fail('INVALID_AMOUNT');
      const previous = row.receipts.get(requestId);
      if (previous && defect !== 'no-idempotency') {
        if (previous.amount !== amount) throw fail('IDEMPOTENCY_CONFLICT');
        return { ...previous };
      }
      if (amount > row.paid - row.refunded && defect !== 'no-balance') throw fail('INSUFFICIENT_BALANCE');
      row.refunded += amount;
      const result = { orderId, requestId, amount, refunded: row.refunded, remaining: row.paid - row.refunded };
      row.receipts.set(requestId, result);
      return { ...result };
    },
  };
}
