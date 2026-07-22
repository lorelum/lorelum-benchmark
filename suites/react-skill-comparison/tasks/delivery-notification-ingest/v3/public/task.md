# Build a delivery notification ingestor

Implement `createDeliveryNotificationIngestor` in `src/delivery-notifications.ts`.
It accepts externally supplied notification values and exposes the latest state
of each delivery.

- A valid notification is a non-array object with nonempty (after trimming)
  `id`, `deliveryId`, and `occurredAt` strings, a declared `status`, and a
  non-array `details` object. `details.facility` is required for `picked_up`,
  `details.recipient` for `delivered`, and `details.reason` for `failed`; each
  required value must be a nonempty string after trimming. `occurredAt` must
  parse to a finite timestamp.
- Reject invalid values without changing state or notifying subscribers. An
  unrecognised status is invalid without reading its `details` property.
- Duplicate notification IDs are ignored. For one delivery, accept an update
  only when its parsed instant is strictly later than the accepted update's
  parsed instant; compare timestamps as instants, not as text. Accepted updates
  retain the order in which a delivery was first accepted.
- `getDeliveries` and subscriber values must not expose mutable internal state.
  A subscriber added while an update is being delivered observes only later
  accepted updates.
- `subscribe` returns an idempotent release function. Preserve the exported
  interfaces and do not add dependencies.
