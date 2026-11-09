#!/bin/sh
set -eu
# /tmp must be a fresh, private per-run tmpfs; no host HOME or Store mounts.
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$LORE_STORE_ROOT" "$LORE_CACHE_ROOT"
exec pi "$@"
