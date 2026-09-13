## Context

The repository already keeps its operational constraints in committed Markdown, OpenSpec, schemas, validators, and CI. The root instructions are the normal entry point, but they have no visible indication of when their operating rules were last checked. The current planning gate also reads as though every benchmark-code implementation must repeat the full candidate-design conversation, even where the work only implements a decision already documented and approved for the current change.

Issue #195 requests a small maintenance loop rather than a new registry, schedule, or policy layer. The existing Issue, PR, and OpenSpec records are sufficient places to record the outcome of a relevant review.

## Goals / Non-Goals

**Goals:**

- Make the most recent review of committed repository rules visible from `AGENTS.md`.
- Make relevant task closure state one concise rule outcome without creating another log.
- Preserve planning confirmation when experimental decisions are new or changed, while allowing implementation to reuse an already-recorded decision.
- Remove one known stale placeholder and one contributor-path omission found in this review.

**Non-Goals:**

- Do not add a registry, per-rule metadata, mandatory calendar automation, or expiration rule.
- Do not change benchmark tasks, public/private boundaries, lifecycle, model authorization, records, or result interpretation.
- Do not turn every ordinary code or documentation task into a governance review.

## Decisions

### A root-level review date is the single freshness signal

`AGENTS.md` will carry `规则最近核对` with an ISO date. It means the committed repository rules were actually reviewed; it is not the file modification time. A rule-relevant change must review the affected text and nearby instructions before merging, then refresh the date when that review establishes the current guidance. The date does not expire automatically and is not a gate by itself; it makes staleness visible without creating scheduled churn.

A per-file timestamp or a new rule register was rejected because it would require parallel maintenance and make a simple signal harder to interpret. Git already records individual file edits.

### Existing work records carry review outcomes

A task that changes, questions, or verifies a shared repository rule records one short outcome in its existing Issue, PR, or OpenSpec: `无需更新` / `已更新 <files>` / `后续 #<issue>`. Ordinary work without a rule finding records nothing. This makes feedback visible where the evidence occurred without another document to curate.

### Planning confirmation follows experimental decisions, not every implementation action

The existing planning gate remains mandatory before a change creates or changes the observable task behavior, treatment/control, acceptance evaluation, source identity, execution plan, or conclusion interpretation. Work that only implements decisions already recorded for the same change cites them and still meets the normal validation and execution gates; it does not re-open unrelated choices. Any new unresolved decision blocks only the affected implementation or execution action.

This is a clarification, not an exception: it preserves the #74-originated guard against building an unreviewed experiment while making approved frozen-candidate work such as #192 auditable without duplicating its prior design discussion.

### Small source corrections are made where readers act on them

`CONTRIBUTING.md` will state that its fixture steps begin after applicable repository process requirements, preventing readers from treating a file-layout checklist as an alternative workflow. The purpose of `openspec-pr-continuity` will replace its generated `TBD` text with the actual change-traceability purpose. No broad rewrite of historical specs is included because their placeholder purposes need independent source review rather than guesses.

## Risks / Trade-offs

- [The date can become cosmetic] → Its definition requires a real review, and rule-relevant changes must record a review outcome.
- [A single date can hide which file changed] → Git and the Issue/PR/OpenSpec outcome preserve the concrete source; adding per-rule timestamps would cost more than it returns.
- [The clarified planning gate can be misread as a bypass] → The requirement explicitly limits reuse to already-recorded decisions and retains all validation and execution gates.
- [The review could grow into a rules rewrite] → The task list restricts changes to confirmed findings and records unresolved items instead of guessing.

## Migration Plan

1. Create and strictly validate this OpenSpec change, then open the required OpenSpec-only PR.
2. Amend root instructions, contributor guidance, and the stable continuity spec on the same branch/PR.
3. Record the review of the core rule sources and replay the agreed historical cases in change verification.
4. Inspect the final diff, validate OpenSpec, and leave the Issue/PR rule-review outcome.

Rollback is a normal revert of the documentation and OpenSpec change. No benchmark artifact, run, or frozen revision changes.

## Open Questions

None. The date is event-driven rather than automatically scheduled; a future team need for a calendar reminder should be evidenced by missed reviews and handled in a separate issue.