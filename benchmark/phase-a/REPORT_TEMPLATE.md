# Phase A experiment record

Copy this template once per condition. Keep unknown values as `unknown`; do not
reconstruct a value from memory after the fact.

```text
Run ID:
Condition: baseline | oracle
Started / finished (local time):

Model provider, model/version:
Reasoning mode / temperature (if exposed):
Shared system prompt or configuration:
Tool permissions and time/turn budget:

Workspace path:
Starter snapshot (git commit or archive hash):
Task prompt hash: sha256sum TASK.md
Oracle prompt hash: sha256sum ORACLE.md (oracle only)
Bun version: bun --version

Conversation transcript or export:
Agent final report:
Commands the agent ran:

Files changed by the agent:
Diff before evaluator injection:

Oracle only — did the agent explicitly use the Practice? Which guidance?
Oracle only — injected Practice was relevant: yes | partly | no, and why:

Evaluator command and complete output:
Functional result: pass | fail | blocked
Wall-clock duration:
Input/output tokens or cost (if the client exposes them):
Retries / tool errors:

Notes on rule adherence, over-design, or suspected leakage:
```

## Minimum return package

For a result I can summarize, send both completed records plus:

1. Both complete evaluator outputs.
2. Both agent transcripts (or their unedited text exports).
3. `baseline-agent.diff` and `oracle-agent.diff` captured before evaluation.
4. The cross-condition `diff -ruN` output requested in the Phase A README.

Do not send credentials, cookies, access tokens, or unrelated private source.
