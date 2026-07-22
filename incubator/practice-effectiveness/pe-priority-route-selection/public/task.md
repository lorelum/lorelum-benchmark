# Update the local notification route selector

The local notification service receives an event and must choose a usable
destination from its configured routes. Update `src/route-selector.ts` so an
eligible event consistently selects the intended available route and avoids
routes that should not receive it.

Preserve the exported interfaces. Do not add dependencies or perform file,
network, or clock-based operations.
