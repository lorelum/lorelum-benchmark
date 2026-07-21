# Build a delivery notification ingestor

Implement `createDeliveryNotificationIngestor` in `src/delivery-notifications.ts`.
It accepts externally supplied notification values and maintains the latest
state of each delivery.

- A valid notification has nonempty `id` and `deliveryId`, a recognised
  `status`, a valid ISO timestamp, and the required nonempty detail for that
  status: `facility` for `picked_up`, `recipient` for `delivered`, or `reason`
  for `failed`.
- Invalid values, duplicate notification IDs, and older notifications for a
  delivery are ignored and return `false`.
- Accepted notifications return `true`, update that delivery, and notify each
  active subscriber once. Delivery snapshots keep first-accepted delivery
  order and must not let callers mutate internal state.
- `subscribe` returns an idempotent release function. Preserve the exported
  interfaces and do not add dependencies.
