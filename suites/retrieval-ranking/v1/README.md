# Retrieval-ranking v1

This revision evaluates the semantic retrieval layer independently from coding Agent outcomes.

The harness input is limited to the case query plus the fixed Store, embedding Profile, candidate width, and result width. Gold labels remain under `private/` and are read only after the harness process returns a valid result.

The corpus inventory contains only Practice IDs, source paths, content digests, and each Pack's pinned install artifact digest. Pack bodies are reconstructed from their pinned upstream commits into a test-owned Store and are not copied into this repository.
