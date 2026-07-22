# Build a shared connection indicator

Implement `createConnectionIndicator`. Screen consumers subscribe to one shared
connection state. A subscriber receives the current valid state immediately.
Use one source subscription while one or more consumers are subscribed; release
that source subscription when the final consumer releases it. A later consumer
must create a new source subscription.

Only `"online"` and `"offline"` source values are valid. Ignore invalid values
and valid values equal to the current state, so neither can notify consumers.
Releasing a consumer subscription is idempotent. If a consumer subscribes from
inside another consumer's update callback, it receives the current state once
from its immediate subscription, and it must not receive that same source
update a second time; it receives later state changes normally. Do not add
dependencies or change exported interfaces.
