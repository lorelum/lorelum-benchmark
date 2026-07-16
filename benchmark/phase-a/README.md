# Phase A — Manual Oracle-Injection Pilot

## Claim

For a bounded React/TypeScript auth-client task, injecting the one
human-confirmed relevant Practice improves task-specific correctness without
giving the agent extra repository access, a different task, or a larger tool
budget.

This is an **oracle-content** pilot. It tests whether the selected Practice is
useful when delivered at the right moment. It does not yet test Lorelum's
retrieval or ranking; those are later product conditions.

## Frozen design

| Item | Baseline | Oracle |
|---|---|---|
| Agent model, version, system prompt, tools, time/turn budget | identical | identical |
| Workspace | fresh `starter/` copy | fresh `starter/` copy |
| Visible task | identical `TASK.md` | identical `TASK.md` |
| Extra context | none | exact `react.auth.single-flight-token-refresh` Practice in `ORACLE.md` |
| Hidden checks | not visible during the run | not visible during the run |

The task deliberately has one relevant Practice. It excludes UI route guards,
cookie-session design, and product retrieval so a failure can be attributed to
content use rather than a broad, mixed intervention.

## Success and limits

The primary outcome is the hidden test suite: concurrent expired-token requests
must result in exactly one refresh, one retry per caller, and a deterministic
terminal logout path. Record the source diff and interaction cost separately.

One baseline/oracle pair is a smoke test, not evidence of a general product
effect. Do not write a positive conclusion from one pair. A useful pilot result
is either (a) a clear behavioural difference worth replicating, or (b) a clear
failure mode that changes the task, Practice, or injection protocol.

## Prepare isolated workspaces

Run this from the repository root. The destination must not exist; this prevents
an old run from leaking edits or cached conclusions into a new condition.

```bash
bash benchmark/phase-a/scripts/prepare-runs.sh /tmp/lorelum-phase-a
cd /tmp/lorelum-phase-a/baseline && bun install --frozen-lockfile
cd /tmp/lorelum-phase-a/oracle && bun install --frozen-lockfile
```

## Start the two conversations

These are two independent attempts at the **same coding task**, not two agents
collaborating. Use two fresh Codex conversations with the same model and the
same configuration. Do not continue this chat for either run: it already knows
about the Practice and would contaminate the baseline.

Open two terminals:

```bash
# Terminal A — start a new Codex conversation in this directory only.
cd /tmp/lorelum-phase-a/baseline
codex

# Terminal B — start a separate new Codex conversation in this directory only.
cd /tmp/lorelum-phase-a/oracle
codex
```

If you use a graphical coding-agent client instead, create two new chats and
open only the matching folder in each chat. Do not attach the repository root,
the other workspace, or the hidden `benchmark/phase-a/checks/` folder.

Both agents must complete the same product change: implement the TODO in
`src/auth/protectedRequest.ts` so the SPA recovers correctly when an in-memory
access credential expires during concurrent protected requests. They may add
focused helpers under `src/auth/`; they must not alter the public contract,
dependencies, or test configuration.

The baseline agent reads only `TASK.md`. The Oracle agent reads `TASK.md` and
the injected `ORACLE.md`, which is the exact
`react.auth.single-flight-token-refresh` Practice. Neither agent sees the
hidden tests during implementation.

Before sending either prompt, have the agent run the same visible command:

```bash
bun run typecheck
```

Give each conversation only its own generated workspace. Do not let the
baseline conversation browse this repository, its sibling workspace,
`ORACLE.md`, or the hidden `checks/` directory.

Use the same model/version, system instructions, tool permissions, time limit,
and allowed command set. If the two conversations use different models, record
the comparison as exploratory rather than causal.

## Prompts for the two conversations

Use these as the entire condition-specific additions after your normal, shared
coding-agent system prompt.

**Baseline**

```text
Work only in the current workspace. Read TASK.md, inspect the starter source,
implement the requested change, and run the checks available in this workspace.
Do not inspect parent or sibling directories and do not use external solutions.
When done, report the files changed, commands run, and any assumptions.
```

**Oracle**

```text
Work only in the current workspace. Before editing, read TASK.md and ORACLE.md.
Treat ORACLE.md as task-scoped engineering guidance: apply it only where it fits
this task. Implement the requested change and run the checks available in this
workspace. Do not inspect parent or sibling directories and do not use external
solutions. When done, report which guidance you used, files changed, commands
run, and any assumptions.
```

## Evaluate after both conversations finish

Do not reveal the hidden checks until both agents have stopped. Then run:

```bash
bash benchmark/phase-a/scripts/evaluate-run.sh /tmp/lorelum-phase-a/baseline
bash benchmark/phase-a/scripts/evaluate-run.sh /tmp/lorelum-phase-a/oracle
```

The evaluator copies its test file into the completed workspace and runs
`bun test`. It never modifies the submitted implementation file. Preserve both
terminal outputs verbatim.

## What to send back

Copy [REPORT_TEMPLATE.md](REPORT_TEMPLATE.md) twice—once for `baseline`, once
for `oracle`—and attach each chat transcript or a faithful export. Include the
two evaluator outputs and the output of:

```bash
diff -ruN /tmp/lorelum-phase-a/baseline/src /tmp/lorelum-phase-a/oracle/src
```

I will turn the raw evidence into a conservative Phase A result: functional
outcome, Practice utilization, cost/latency, failure modes, threats to validity,
and the next test decision. Only then should the Feishu Phase A section be
updated.

## Capture each agent's diff before evaluation

After an agent finishes and **before** you run the hidden evaluator, capture
its submitted change. Excluding the Bun lockfile keeps dependency installation
noise out of the implementation evidence.

```bash
diff -ruN --exclude='*.test.ts' \
  /home/theleeying/lorelum-benchmark/benchmark/phase-a/starter/src \
  /tmp/lorelum-phase-a/baseline/src \
  > /tmp/lorelum-phase-a/baseline-agent.diff || true

diff -ruN --exclude='*.test.ts' \
  /home/theleeying/lorelum-benchmark/benchmark/phase-a/starter/src \
  /tmp/lorelum-phase-a/oracle/src \
  > /tmp/lorelum-phase-a/oracle-agent.diff || true
```
