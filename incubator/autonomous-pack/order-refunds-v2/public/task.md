# Support partial refunds on orders

The order service currently tracks payments, but its refund operation was built for a one-shot refund. Extend it to support multiple partial refunds without ever refunding more than was paid, including when requests overlap.

The entry point is `src/index.js`. Keep its exported `createLedger(orders)` API and the existing asynchronous `refund(orderId, requestId, amount)` and `getOrder(orderId)` methods. An order supplied to the constructor has `{ id, paid }`; `paid` is a non-negative safe integer number of cents. IDs are non-empty strings. Order IDs are unique. The service is in-memory; persistence across process restarts is not required.

A successful refund returns `{ orderId, requestId, amount, refunded, remaining }`, where the last two fields describe the order immediately after that refund. A subsequent request with the same order ID, request ID, and amount must return the original result without applying the refund again, even after other refunds. Request IDs are scoped to an order. Reusing one with a different amount is an error, not a new refund. A refund amount must be a positive safe integer of cents, and cannot exceed the order's remaining paid amount. Concurrent calls must behave as if each completed in some serial order; unsuccessful calls must not change the order or reserve an idempotency key. `getOrder` returns `{ id, paid, refunded, remaining }`, or throws for an unknown order. Its result must not expose mutable internal state.

Reject invalid amounts with an error whose `code` is `INVALID_AMOUNT`, unknown orders with `ORDER_NOT_FOUND`, conflicting reuse with `IDEMPOTENCY_CONFLICT`, and excess refunds with `INSUFFICIENT_BALANCE`. Check unknown order before request-specific validation, then validate the amount, then check idempotency, then balance. Callers supply non-empty string order and request IDs. Use ordinary rejected promises for errors from these asynchronous methods.

Keep the code runnable on Node.js 22 without external services or dependencies. You may restructure the implementation while retaining the public API. Explain any trade-offs and how you would verify the change in your final response.
