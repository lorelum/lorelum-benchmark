# Load an authorized order route without exposing internal data

The order route first authenticates a viewer, loads the requested order, then
adds independent data for an authorized account. The current route is correct
on the happy path but needlessly serializes its final requests and has no
explicit public-data boundary.

Update `src/order-route.ts` while preserving exported interfaces.

- Empty IDs return `not-found` without API calls.
- Fetch the viewer before loading account-scoped order data.
- A viewer from another account receives `forbidden` and must not trigger
  shipping or refund-policy requests.
- Once authorization succeeds, shipping and refund policy are independent and
  should not wait for one another.
- Return only the public order fields and preserve original API errors.
