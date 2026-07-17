# Contract-Derived Seed Task Plan

## Boundary

These tasks are a substitute for historical Lorelum work while the project is
too early to provide a representative issue/PR/regression pool. They measure
whether Oracle-injected Practices help on implementations derived from frozen
public contracts. They must be reported as seed evidence, not production-task
evidence.

## Candidate-to-run gate

1. A task author creates a candidate card from `sources.yaml`, without citing
   or quoting the eventual Practice.
2. A reviewer writes acceptance checks from the product contract and freezes
   the starter snapshot, prompt, and expected baseline failure mode.
3. A separate content reviewer selects or authors one relevant Practice and a
   comparable unrelated control. Neither is copied into `task.md`.
4. The reviewers set `status: frozen`, add the task under `suite.yaml.tasks`,
   and generate isolated workspaces for baseline, Oracle, and irrelevant-Practice
   conditions.

## Isolation

Run each condition in a separate Docker or Podman container with network
disabled and only that condition workspace mounted. The coding agent never sees
the evaluator, another condition, `oracle.yaml`, or an unrelated Practice.
Persist only the completed diff and transcript outside the container.

## Run policy

Freeze model id, system prompt hash, parameters, tool permissions, time/token
budget, task version, starter digest, and injected-content hash before a run.
Run baseline, Oracle, and irrelevant-Practice conditions at least three times
per frozen task; use five repetitions for the formal pilot. Store every run as
one JSONL object conforming to `../../run-record.schema.json`.

## Decision rule

Oracle must improve functional and Practice-compliance outcomes over both
baseline and irrelevant-Practice conditions on multiple frozen seed tasks before
the team claims seed-phase support. A Lorelum retrieval condition is deferred to
stage B and must be compared against the Oracle distribution, not a single run.
