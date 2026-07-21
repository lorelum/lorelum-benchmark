# Build an order fulfilment service

Implement `createFulfilmentService` in `src/fulfilment-service.ts`.

- An order starts in `draft`. `reserve` moves it to `reserved`. Only a reserved
  order can be dispatched through the injected carrier.
- While the carrier request is outstanding, the order is `dispatching`. On
  success it becomes `dispatched` with the returned tracking code; `fulfil`
  then moves it to `fulfilled`.
- A carrier rejection moves the order to `failed` and `dispatch` rejects with
  the original error. `fulfilled` and `failed` are terminal.
- Invalid commands return their declared no-op result and do not change state.
  Concurrent `dispatch` calls while one carrier request is pending share that
  request.
- `getOrder` must not expose mutable internal state. Preserve the exported
  interfaces and do not add dependencies.
