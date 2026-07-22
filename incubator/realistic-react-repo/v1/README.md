# Realistic React Repository v1

This incubator contains the public starter and private benchmark material for a
small, self-contained Next App Router repository. It is not an executable
benchmark task revision yet. No result may be recorded from this directory.

`public/starter/app` is the only tree intended for an agent workspace.
`private/` contains evaluator-only material and must never be copied into that
workspace. The candidate anchor for future Pi v2 requests is the regular file
`public/starter/app/package.json`; evaluators derive the app root from it.

`benchmark.yaml` is the incubator-level candidate contract. It deliberately
does not add a new Pi adapter version or change the historical v2 meaning:
Pi still receives a regular candidate file, while the trusted evaluator derives
and evaluates the rooted application tree.

The dependency graph is intentionally exact. Resolve it once with Bun, commit
the generated `bun.lock`, then use `bun install --frozen-lockfile` only.
