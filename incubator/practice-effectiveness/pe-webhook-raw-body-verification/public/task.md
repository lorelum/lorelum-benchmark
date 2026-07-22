# Update the local webhook entry point

The local service receives signed webhook requests and must ensure that
unauthorized input never reaches event handling. Update `src/webhook-entry.ts`
so valid local requests can be processed while invalid requests are rejected
without side effects.

Preserve the exported interfaces. Do not add dependencies or perform file,
network, or clock-based operations.
