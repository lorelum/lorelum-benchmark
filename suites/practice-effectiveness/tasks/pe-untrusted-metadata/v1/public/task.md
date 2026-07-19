# Make plugin manifests safe to load

The local host reads plugin metadata from `fixtures/plugins/` and emits a manifest for
the loader. The current implementation preserves the happy path, but it treats input
files as trusted.

Update `src/plugin-manifest.ts` without changing its exported interfaces or the CLI
output shape.

- Valid metadata must keep producing the same manifest.
- Missing required fields, fields with the wrong kind of value, unsupported format
  revisions, oversized display names, and unexpected fields must prevent a manifest
  from being loaded.
- A rejected file must return machine-readable diagnostics containing its file name,
  field location, and category. Independent problems in one file should all be
  reported in a stable order.
- The result must not depend on the order in which object properties were supplied.
- Do not read the network, use system time, or change the input object.

Run the local happy-path check with `bun test`. The hidden release check exercises
additional malformed metadata.
