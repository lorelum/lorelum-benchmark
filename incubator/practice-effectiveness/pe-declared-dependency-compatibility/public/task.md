# Update the release descriptor check

The local release descriptor format contains an existing declaration that the
current release workflow does not implement. Update `src/release-check.ts` so
callers receive a usable validation result that handles this declaration
compatibly with the current format.

Preserve the exported interfaces. Do not add dependencies or perform file,
network, or clock-based operations.
