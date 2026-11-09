# Refund candidate: private evaluator and calibration

This is an incubator candidate, not a frozen revision, pilot result, or formal record. The only agent input is `public/task.md` and the contents of `public/starter/`. Never copy this directory's `private/`, calibration sources, test names, results, or rubric into an agent workspace, prompt, trace, or model input. Evaluate a separate completed workspace after the agent has stopped. `private/snapshot.json` identifies the candidate source as created; changes to any covered file require a new snapshot and, once results exist, a new revision.

## Semantic check

The evaluator runs on the control host; it never imports candidate code. Node 22 or later, Docker, and the prebuilt `lorelum-autonomous-pack:v1` image are required. Set `WORKSPACE` to the absolute path of a completed workspace containing `src/index.js`. The host launches a fresh container with no network, a read-only root, dropped capabilities and resource limits; it mounts only that workspace and the single non-sensitive `evaluator/bridge.mjs` file, both read-only. The bridge handles generic JSONL create, method-call, and returned-object mutation requests. Private cases and assertions remain on the control host and must never be mounted in the container. Each test creates a separate ledger; overlapping calls are sent without waiting for one another. Non-finite numbers have explicit JSON encodings, and errors return their `code`.

From the repository root:

```sh
WORKSPACE=/absolute/path/to/workspace node --test incubator/autonomous-pack/order-refunds-v1/private/evaluator/semantic.test.mjs
```

PowerShell:

```powershell
$env:WORKSPACE = 'C:\absolute\path\to\workspace'
node --test incubator/autonomous-pack/order-refunds-v1/private/evaluator/semantic.test.mjs
Remove-Item Env:WORKSPACE
```

Optionally set `LORELUM_EVALUATOR_IMAGE` to a compatible prebuilt image. `WORKSPACE` is mandatory; do not point it at a parent containing private material. The Docker daemon must be able to bind-mount both absolute paths. A zero exit means all semantic assertions passed; a missing image, container error, malformed response, timeout, import error, or nonzero exit is a failure, not a passing score. The evaluator makes no Lore or model calls. Apply an outer deadline and clean up any named `lorelum-evaluator-*` container if the control process is forcibly terminated.

## Calibration

Each calibration directory is a self-contained candidate workspace. Run the same evaluator independently on the four workspaces and on the unchanged starter:

```sh
base="$PWD/incubator/autonomous-pack/order-refunds-v1"
for fixture in valid-atomic valid-queue defect-idempotency defect-balance; do
  WORKSPACE="$base/private/calibration/$fixture" node --test "$base/private/evaluator/semantic.test.mjs"
done
WORKSPACE="$base/public/starter" node --test "$base/private/evaluator/semantic.test.mjs"
```

`valid-atomic` and `valid-queue` should pass. `defect-idempotency` and `defect-balance` should fail their respective semantic checks; the unchanged starter should fail. These are expected outcomes, not recorded results: execute the commands to establish actual evidence. The queue and atomic implementations deliberately differ in state representation and concurrency handling. Defects alter one rule each. No calibration or evaluator outcome is evidence that an agent ran or that a treatment works.

## Blind quality review (separate from semantic pass/fail)

Review anonymized final diffs without treatment identity, trace, retrieved text, or experimental condition. Record short evidence and one of `observed`, `not observed`, or `not assessable` for each dimension; do not turn these into an undisclosed weighted total or substitute them for semantic tests.

- **Change comprehensibility:** Can the reader follow balance and idempotency decisions and understand the concurrency boundary? Cite the relevant code, or explain why it cannot be assessed.
- **Maintainability:** Are responsibilities, state transitions, and error handling understandable and coherent with the existing project? Cite concrete consequences rather than rewarding number of files, abstraction, comments, or naming style alone.
- **Verification evidence:** Do agent-authored checks exercise meaningful cases including replay, rejection, and overlap? Cite the checks and distinguish authored tests from actually executed tests.
- **Robustness within the stated contract:** Does the implementation avoid leaking mutable state and preserve correct state after errors? Cite evidence; do not penalize missing persistence, input restrictions, or other unstated features.

A synchronous atomic transition and an asynchronously serialized transition are both acceptable. Do not require a mutex, a particular data structure, exact method decomposition, or a particular implementation of tests. Blind review remains a subjective, uncertain soft observation and should be reported separately from deterministic behavior, health, process, and cost.

## Boundary

The public scenario is deliberately in-memory and single-process. It does not claim durable transactions, cross-process coordination, production payment-provider behavior, or exhaustive concurrency verification. The semantic probes exercise representative orderings and error precedence, not all possible JavaScript programs. Container isolation reduces exposure of private files but is not a security proof; the candidate can observe requests sent to it and may behave adversarially.
