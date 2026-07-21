# Build a delivery notification ingestor

Implement `createDeliveryNotificationIngestor` in `src/delivery-notifications.ts`.
It accepts externally supplied notification values and exposes the latest state
of each delivery.

- A valid notification has nonempty `id` and `deliveryId`, one of the declared
  statuses, a valid ISO timestamp, and the required nonempty detail for that
  status: `facility` for `picked_up`, `recipient` for `delivered`, or `reason`
  for `failed`.
- Reject invalid values without changing state or notifying subscribers. An
  unrecognised status is invalid without inspecting its `details` value.
- Duplicate notification IDs and updates not newer than the accepted update for
  the same delivery are ignored. Accepted updates retain the order in which a
  delivery was first accepted.
- `getDeliveries` and subscriber values must not expose mutable internal state.
  A subscriber added while an update is being delivered observes only later
  accepted updates.
- `subscribe` returns an idempotent release function. Preserve the exported
  interfaces and do not add dependencies.
