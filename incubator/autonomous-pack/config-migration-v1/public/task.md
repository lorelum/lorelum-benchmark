# Migrate configuration to version 2

Implement the dependency-free Node.js JSON Lines CLI in `src/cli.js`. Each input line is a JSON object containing `config`, a configuration object; write one JSON object `{ "config": <migrated config> }` on its own output line. Process multiple lines in the same process, in order, without diagnostic output on stdout. Input is always valid JSON and conforms to the shapes below. The CLI must work with Node.js 22.

A configuration is a JSON object. Its optional `server`, `logging`, and `features` fields, when present, are objects. Optional `host`, `port`, and `logLevel` legacy fields and `server.host`, `server.port`, and `logging.level` modern fields have respectively string, integer, and string values. Other fields contain arbitrary JSON values. `version`, if present, is a number.

Return a new version 2 configuration as follows:

- Set `version` to `2` and remove the root legacy keys `host`, `port`, and `logLevel`.
- Ensure `server`, `logging`, and `features` are objects. For `server.host`, prefer the existing modern value, otherwise use legacy `host`, otherwise `"127.0.0.1"`. For `server.port`, prefer modern, then legacy, then `3000`. For `logging.level`, prefer modern, then legacy `logLevel`, then `"info"`. Presence, not truthiness, determines precedence.
- Preserve all other root fields and all other properties of `server`, `logging`, and `features`, including nested JSON values.
- Migrating the output again must produce an identical JSON value. Do not mutate the input object passed to the migration function.

The starter separates the CLI and migration logic, but you may restructure it as long as `src/cli.js` remains the CLI entry point. No network, external services, or dependencies are needed.
