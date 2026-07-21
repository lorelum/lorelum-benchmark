# Build a shared connection indicator

Implement `createConnectionIndicator`. Screen consumers subscribe to one shared
connection state. A subscriber receives the current valid state immediately.
Invalid source values are ignored. Releasing a subscription is idempotent, and
consumers added while an update is being delivered receive only later updates.
Do not add dependencies or change exported interfaces.
