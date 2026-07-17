# Optimize a React dashboard loader

The dashboard needs a user profile, billing summary, and feature flags before
it can render. All three requests are independent, but the current loader
waits for each response before starting the next request.

Update `src/dashboard.ts` so that independent requests start without waiting
for prior independent requests. Preserve the public types and the returned
object shape. Errors from a request must still reject the loader with the
original error.

Do not add dependencies or change the API interface.
