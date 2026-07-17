# Exploratory Result: Relevant Practice Signal

Date: 2026-07-16

## Frozen task

- Task: `anti-pattern-registry-integrity-v1`
- Source kind: `contract-derived-seed`
- Frozen source snapshot: `e0a2cf2541390301490b36af88d72883162c598b`
- Model shown during all three task executions: `gpt-5.4 medium`
- Shared environment: fresh Bun workspace with the same starter and task
  prompt. The Oracle and negative-control prompts also instructed the agent to
  read their injected `ORACLE.md`.

## Functional outcome

| Condition | Injected content | Hidden checks | Observed implementation choice |
| --- | --- | --- | --- |
| baseline | none | 1/2 | Accumulated duplicate and unresolved-reference issues, but returned traversal order without sorting. |
| Oracle Practice | `lorelum.format.cross-reference-integrity` | 2/2 | Indexed first, accumulated all issues, then sorted by `path`, `id`, and `code`. |
| irrelevant Practice | `lorelum.retrieval.ranking-explanation` | 1/2 | Accumulated the same issue classes but returned traversal order without sorting. |

## Interpretation

The relevant Practice produced a functional improvement over both the baseline
and an injected Practice of similar length that is unrelated to pack integrity.
The Oracle transcript explicitly applied the Practice's two-pass scan and
diagnostic-order guidance. On this task, the result is therefore a relevant
Practice signal rather than the most direct explanation being extra context.

This is one contract-derived seed task with one run per condition. It is not
evidence that Phase A succeeds overall, that production tasks benefit, or that
the Lorelum retrieval pipeline selects the Practice correctly.

## Coverage and metadata limits

- The evaluator does not cover a Practice reference to an id with duplicate
  registry definitions. The reference implementation treats that id as
  present, while the baseline implementation treats it as unresolved.
- No consistent model parameters, token counts, latency, retry counts, prompt
  hashes, persistent transcript paths, or blinded human-review results were
  captured. `schemas/run-record.schema.json` records are therefore not emitted
  for these executions.
- Repeat this card and add additional frozen tasks before including it in any
  aggregate Phase A conclusion.
