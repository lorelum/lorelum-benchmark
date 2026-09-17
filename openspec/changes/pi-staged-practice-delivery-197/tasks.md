## 1. Contract and planning gate

- [x] 1.1 Record the confirmed #197 planning answers in the issue and `design.md`/`tasks.md`: observable task/Practice behavior, baseline defect and differentiation, related Practice plus equal-length irrelevant control, private semantic/quality acceptance, #196 starter and immutable source commit, and model/prompt/budget/tool/blind boundaries.
- [x] 1.2 Define the versioned `staged-practice-delivery/v1` types/schema for one delivery-node declaration, fixed treatment metadata, condition scope, private audit events, redacted trace, and fail-closed outcomes; document write scope and public/private ownership.
- [x] 1.3 Add a preflight validator that consumes #199's frozen `agentic-coding-replan-on-material-drift/v1` payload, verifies Pack ref/version/commit, Practice/source/content/card hashes, candidate/snapshot identity, and rejects any missing/drifted/private material before session start.
- [x] 1.4 Extend the staged timing plan parser so each attempt declares exactly one of `task_start`, `constraint_followup`, and `first_implementation_checkpoint` with explicit acknowledgement boundaries and delivery condition declarations; do not add query or trigger recognition.

## 2. Same-session delivery implementation

- [x] 2.1 Implement a single-session controller/adapter that starts Pi once, delivers `task_start` before the first Agent response, sends the scripted constraint follow-up before Agent continuation, and stream-stops at the checkpoint marker before the next same-session resume.
- [x] 2.2 Deliver the same fixed Practice card bytes exactly once at the selected timing node for timing conditions only; return no payload for baseline/undeclared conditions and never materialize the card in the Agent workspace.
- [x] 2.3 Enforce session-id continuity and stop the attempt on start/resume mismatch, missing acknowledgement, unsupported node, payload corruption, or any delivery failure; never silently move a card to another node.
- [x] 2.4 Write one private delivery audit JSONL event per attempt plus a private summary and redacted public trace with stable schema/version, ordered node, condition, session binding, treatment version, Pack provenance/hash fields only in private sidecar, and explicit outcome.

## 3. Deterministic verification

- [x] 3.1 Add mock/fixture tests for each timing condition: exact selected node, one session id, exactly one identical Practice/body hash delivery, scripted follow-up/checkpoint boundaries, and no workspace materialization.
- [x] 3.2 Add negative tests for reordered/missing/heuristic nodes, new-session resume, treatment/hash drift, corrupt payload, missing checkpoint marker, unsupported/indeterminate delivery, and stop-after-failure semantics.
- [x] 3.3 Add baseline and undeclared-condition isolation plus public/private serialization audits proving no Practice body, private path, evaluator/oracle/scoring, Pack root/store path, or workspace path is exposed.
- [x] 3.4 Run focused runner contract tests with mocks; do not invoke Pi, Lore, external network, model APIs, or create formal records.

## 4. Repository validation and review evidence

- [x] 4.1 Run `bun run validate` after every benchmark code/schema contract slice and record the exact result.
- [x] 4.2 Run `git diff --check` and the repository public/private leakage audit; confirm only declared `src/benchmark/`, `schemas/`, docs and OpenSpec paths changed.
- [x] 4.3 Complete the required first-round `ai-code-review` and, only after all must-fix findings are resolved, the independent `thermo-nuclear-code-quality-review`; save both findings-to-rule mappings under this change's verification evidence.
- [ ] 4.4 Update the same issue/PR with implementation boundary, focused validation commands, unexecuted model/formal-run items, residual risks, and candidate-only lifecycle status; do not create a suite revision or formal record.