# Make plugin manifests safe to load

The local host reads plugin metadata from `fixtures/plugins/` and emits a manifest for
the loader. The current implementation only handles the supplied happy-path fixture.

Complete `src/plugin-manifest.ts` without changing its exported interfaces or the CLI
output shape. Preserve the compatible manifest for valid local metadata and make
rejected metadata usable by the host's existing diagnostic consumer. Keep the command
local: it must not contact external services, use system time, or change its input.

Run the local check with `bun test`. Additional release fixtures exercise malformed
metadata and compatibility boundaries.
