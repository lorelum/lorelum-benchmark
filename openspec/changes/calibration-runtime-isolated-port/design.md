## Context

Issue #109 addresses a concurrency hazard in the private calibration runtime.
The two `injection-calibration/v1` incubator candidates from #97 (and their
#106 overlay migration) each run a Playwright calibration matrix that starts a
Vite dev server. The base `playwright.config.ts` fixes `webServer.url` and the
`bun run dev -- --host 127.0.0.1 --port 4173` command to `127.0.0.1:4173`, and
every composed fixture tree inherits this base. When two candidate calibrations
run concurrently one process fails to bind `4173`; serial execution passes.

The calibration runtime is private and kernel-driven: the `calibrate` subcommand
resolves calibration sets, stages a temporary private tree, and invokes each
declared calibration role with a private runtime environment. The role command
runs `bun run test`, which Playwright drives against the fixed port. There is
currently no per-invocation port ownership, allocation, or injection contract.

The implementation must give each concurrent calibration invocation an exclusive
local port (or equivalent private base URL), prove Playwright and Vite consume
the same value, fail closed when allocation or consumption fails, and keep the
port inside the private calibration runtime. It must not change #75/#97 task
wording, Practice, source pin, quality gates, or prior calibration conclusions,
and it must not rewrite existing immutable registry bases or calibration sets.

## Goals / Non-Goals

**Goals:**

- Provide an exclusive, auditable per-invocation port or private base URL for
  each kernel-driven calibration role invocation, with no TOCTOU gap between
  discovery and bind.
- Inject the value into Playwright and Vite through a single private runtime
  contract so every consumer validates the same private runtime.
- Fail closed with private diagnostics on allocation failure, invalid values,
  service-not-ready, timeout, and double-release.
- Keep the port/base URL inside the private calibration runtime; it must not
  appear in agent workspace, public prompt, ordinary snapshot files, Practice
  payload, trace, or record.
- Express any affected fixture configuration as new immutable registry base
  and calibration set versions; do not rewrite existing versions.

**Non-Goals:**

- Changing #75/#97 task wording, Practice, public behavior, source pin, quality
  gates, or prior calibration conclusions.
- Copying or rebuilding the #106 overlay resolver; #109 builds on it unchanged.
- Global CI serialization, reusing an existing service, fixed ports, or
  unauditable random port guessing.
- Snapshot v2, formal records, or Pi/model/retrieval/blind-review execution.

## Decisions

> 待规划澄清确认后填充。以下为初版候选设计，需经需求方确认后写回 Issue #109、
> 本 design 与 `tasks.md`，再开始实现。

### Port ownership and allocation

The kernel calibration runtime (the `calibrate` path) owns port allocation per
invocation. Allocation binds an ephemeral TCP port atomically (open a listening
socket, read its assigned port, and hold the socket until the calibration role
releases it) so there is no discover-then-bind TOCTOU window. The allocator
rejects explicit invalid or out-of-range values and never reuses a held port
within one runtime. Allocation failure fails closed before any role runs.

### Injection contract

The kernel injects the private base URL (and, where needed, the port) into the
calibration role's private runtime environment. Playwright and Vite both read
the same private contract value: Playwright uses an external `baseURL` and
disables its `webServer` (no fixed port), while Vite binds the dev server to the
held port. Consumers that do not observe the injected value, or that fall back
to a fixed port, cause the role to fail closed.

### Failure and timeout semantics

Allocation failure, an invalid value, a service that does not become ready, or
a timeout all fail the role with a private diagnostic. Released ports are
verified free; double-release or release of an unheld port fails closed. No
partial calibration result is treated as valid.

### Migration strategy

A new immutable registry base version carries the port-aware fixture
configuration; existing base/source versions remain unchanged. The two #97
candidates add a `quality-probe/v2` calibration set rather than rewriting
`quality-probe/v1`. Snapshots are regenerated for the new set identity; the old
set source and identity remain reproducible.

### #108 dependency

#106/PR #108 (the overlay resolver, private staging, and `calibration_sets_hash`)
is a prerequisite. If #108 is unmerged at implementation time, the dependency
strategy is confirmed in planning clarification (wait for merge, base on its
branch, or another traceable approach); #109 must not copy or rebuild the
overlay mechanism.

## Risks / Trade-offs

- [A discover-then-bind gap causes TOCTOU races] -> Bind the listening socket
  first and read the assigned port; never probe a free port then rebind.
- [Playwright and Vite consume different values] -> One private runtime contract
  feeds both; tests assert both observe the same base URL/port.
- [Port leaks across concurrent invocations] -> Per-invocation ownership with
  verified release; held ports are never reused within one runtime.
- [Port information leaks into public artifacts] -> Port stays in the private
  runtime environment; snapshot ordinary files and traces record only version
  and hash.
- [Rewriting existing sets changes prior conclusions] -> New base/set versions;
  old versions stay immutable and reproducible.

## Migration Plan

1. Complete strict OpenSpec validation and create this change's OpenSpec-only
   PR.
2. Record the confirmed allocation, injection, failure, migration, and #108
   dependency decisions in Issue #109, this design and `tasks.md`.
3. Implement the port allocator, injection contract, and fail-closed tests
   before changing any candidate source.
4. Add the port-aware base version and `quality-probe/v2` sets for the two #97
   candidates; regenerate and verify snapshots without changing public
   behavior, Practice, source pin, or quality gates.
5. Add a concurrent integration test asserting no `EADDRINUSE`, stable results,
  and serial-baseline equivalence.

## Confirmed Evolution Model

New calibration set versions express port-aware configuration changes. Existing
sets and registry bases remain immutable and reproducible from their committed
history. A candidate adds a new set/version rather than rewriting an existing
one; the aggregate resolved hash changes for the current snapshot while prior
identity stays intact.