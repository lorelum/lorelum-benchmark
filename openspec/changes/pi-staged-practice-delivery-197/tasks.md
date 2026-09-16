## 1. Contract and planning gate

- [ ] 1.1 Record the confirmed #197 planning answers in the issue and `design.md`/`tasks.md`: observable task/Practice behavior, baseline defect and differentiation, related Practice plus equal-length irrelevant control, private semantic/quality acceptance, #196 starter and immutable source commit, and model/prompt/budget/tool/blind boundaries.
- [ ] 1.2 Define the versioned `staged-practice-delivery/v1` types/schema for node declarations, fixed treatment metadata, condition scope, private audit events, redacted trace, and fail-closed outcomes; document write scope and public/private ownership.
- [ ] 1.3 Add a preflight validator that consumes #199's frozen `agentic-coding-replan-on-material-drift/v1` payload, verifies Pack ref/version/commit, Practice/source/content/card hashes, candidate/snapshot identity, and rejects any missing/drifted/private material before session start.
- [ ] 1.4 Extend the staged timing plan parser so it declares exactly `task_start`, `constraint_followup`, and `first_implementation_checkpoint` with explicit acknowledgement boundaries and delivery condition declarations; do not add query or trigger recognition.

## 2. Same-session delivery implementation

- [ ] 2.1 Implement a single-session controller/adapter that starts Pi once, delivers `task_start` before the first Agent response, sends the scripted constraint follow-up before Agent continuation, and waits for the task-script checkpoint acknowledgement before the third node.
- [ ] 2.2 Deliver the same fixed Practice card bytes at each declared node for treatment conditions only; return no payload for baseline/undeclared conditions and never materialize the card in the Agent workspace.
- [ ] 2.3 Enforce session-id continuity and stop the attempt on start/resume mismatch, missing acknowledgement, unsupported node, payload corruption, or any delivery failure; never silently move a card to another node.
- [ ] 2.4 Write private delivery audit sidecar events and redacted public trace entries with stable schema/version, ordered node, condition, session binding, treatment version, Pack provenance/hash fields in the private sidecar, and explicit outcome.

## 3. Deterministic verification

- [ ] 3.1 Add mock/fixture tests for the happy path: exact node order, one session id, identical Practice/body hash across three deliveries, scripted follow-up/checkpoint boundaries, and no workspace materialization.
- [ ] 3.2 Add negative tests for reordered/missing/heuristic nodes, new-session resume, treatment/hash drift, corrupt payload, unsupported/indeterminate delivery, and stop-after-failure semantics.
- [ ] 3.3 Add baseline and undeclared-condition isolation plus public/private serialization audits proving no Practice body, private path, evaluator/oracle/scoring, Pack root/store path, or workspace path is exposed.
- [ ] 3.4 Run focused runner contract tests with mocks; do not invoke Pi, Lore, external network, model APIs, or create formal records.

## 4. Repository validation and review evidence

- [ ] 4.1 Run `bun run validate` after every benchmark code/schema contract slice and record the exact result.
- [ ] 4.2 Run `git diff --check` and the repository public/private leakage audit; confirm only declared `src/benchmark/`, `schemas/`, docs and OpenSpec paths changed.
- [ ] 4.3 Complete the required first-round `ai-code-review` and, only after all must-fix findings are resolved, the independent `thermo-nuclear-code-quality-review`; save both findings-to-rule mappings under this change's verification evidence.
- [ ] 4.4 Update the same issue/PR with implementation boundary, focused validation commands, unexecuted model/formal-run items, residual risks, and candidate-only lifecycle status; do not create a suite revision or formal record.