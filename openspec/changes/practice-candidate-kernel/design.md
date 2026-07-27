## Context

Issue #98 precedes the fixture expansion in #89. The existing login candidate owns a complete application, evaluator, calibration samples, conditions, and snapshot. That remains a valid historical candidate, but copying its generic source and orchestration for every future candidate would make an approximately twenty-candidate corpus unnecessarily repetitive and make shared fixes difficult to apply consistently.

The kernel must share only source and mechanics. Public task behavior, Practice cards, oracle, candidate-owned quality probe, calibration source variations, and conditions remain candidate-specific and private where appropriate. Agent workspaces may receive only a resolved `public/task.md` and starter tree; no private material may be used to construct or enter that workspace.

## Goals / Non-Goals

**Goals:**

- Establish a versioned shared kernel and minimal candidate overlay contract suitable for at least twenty candidates using the same frontend stack.
- Materialize and audit a resolved public candidate input without copying dependency trees into every candidate directory.
- Provide a shared offline calibration/isolation entry point while keeping the semantic oracle and quality-probe implementation candidate-owned.
- Use the two confirmed #89 topics as the first validation inputs only after their declared behavior, Practice, calibration and execution boundaries are written back to #89.

**Non-Goals:**

- Migrate, modify, snapshot, or execute the existing #75 login candidate.
- Create shared rules for candidate-specific semantic or quality acceptance.
- Execute Pi, a model provider, retrieval, blind review, batch execution, formal records, or suite revisions.
- Implement #90 preflight integration, resume, or result aggregation.

## Decisions

### Preserve source ownership and visibility

The kernel is versioned repository source. A candidate declares a public overlay and private references to its own Practice, oracle, evaluator and calibration case paths. Materialization accepts only declared public source inputs and writes only the resolved public task/starter tree to an attempt workspace. The shared calibration entry point reads candidate-private materials only after an attempt, or when running maintainer-only offline calibration.

This is preferred over a global catalog of Practice/oracle/probe definitions because those define per-candidate meaning and must remain independently reviewable. It also avoids a generic evaluator that would blur distinct responsibility signals.

### Resolve source before snapshotting

The snapshot contract will record the kernel identifier/hash, candidate overlay hashes, and hashes of the materialized public task/starter tree. Verification will fail when any source input or resolved output changes. Generated dependencies, build output, test output, run workspaces, and evidence indexes remain excluded.

Snapshotting only the overlay would not detect a changed kernel. Snapshotting only the materialized tree would make it difficult to trace the source inputs that created it. Both are required for review and reproduction.

### Share orchestration, not assertions

Candidate declarations identify four calibration roles and expected semantic/probe outcomes. The shared runner invokes candidate-owned public semantic commands and candidate-owned private quality probes, then reports role results. It must not inspect candidate-specific domain strings, AST rules, or oracle content.

This retains responsibility-equivalent calibration while avoiding duplicated process setup. A single global quality probe was rejected because the two #89 candidates intentionally measure different domain boundaries.

### Implementation gate

The kernel representation is intentionally unresolved until the initial OpenSpec PR exists and the requirements owner confirms it:

- **Option A:** a versioned source template plus explicit file overlays, materialized by a small resolver.
- **Option B:** a declarative manifest that generates the resolved starter from structured fields.

Option A better preserves ordinary React source review and permits variations that do not fit a small DSL. Option B can reduce per-candidate source further but risks a brittle generator and hidden source behavior. The confirmed option, overlay mutability rules, and whether #89 supplies two full end-to-end validation inputs or one minimal smoke input plus one richer input must be written to Issue #98 and this design/tasks before implementation.

## Risks / Trade-offs

- [Kernel changes invalidate many candidates] -> version the kernel and bind its hash in each resolved snapshot; never alter a kernel version used by a recorded candidate.
- [Resolver leaks private paths or text] -> use explicit allowlists, reject private path traversal, and audit resolved workspaces for private identifiers and files.
- [Declarative metadata forces false uniformity] -> limit it to source/role/orchestration facts; retain candidate-owned evaluator and oracle code.
- [#89 fixture work becomes duplicated] -> do not commit candidate fixtures until #98 is merged; rebase #89 and author its two candidates using the confirmed kernel contract.

## Migration Plan

1. Create and validate this OpenSpec-only PR.
2. Confirm the representation and first validation scope through Issue #98 and this design/tasks.
3. Implement the kernel, resolver, calibration/isolation entry point, and resolved snapshot verification on this branch.
4. Validate with the agreed #89 inputs without model execution, then merge #98.
5. Rebase #89 and author the two candidate declarations/overlays against the merged contract. The #75 candidate remains unchanged.

## Open Questions

- Select Option A or Option B for the first kernel version.
- Confirm whether two complete #89 candidates, or one minimal and one full candidate, are the initial #98 validation inputs.
- Confirm whether lockfiles belong only to the versioned kernel or whether a candidate may override one under explicitly versioned compatibility constraints.
