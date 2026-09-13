## Context

The repository already requires an issue, strict-valid OpenSpec change, and an initial OpenSpec-only PR before benchmark implementation. It also contains a planning-clarification requirement, but it does not require an Agent to stop in a visible planning mode, show the concrete implementation direction, and obtain confirmation before writing implementation files. The result is a gap between a valid proposal and a direction the requester has actually checked.

Issue #195 exposed that gap: an implementation can be locally reasonable yet solve a narrower problem than the requester intended. The requested control is deliberately small: a visible plan and explicit confirmation before implementation, rather than a new rule registry or extra per-task paperwork.

## Goals / Non-Goals

**Goals:**

- Put a mandatory, user-visible Plan-mode phase between OpenSpec readiness and non-OpenSpec implementation.
- Make the plan sufficient for the requester to verify scope, practical effect, non-goals, and validation before repository policy or code is changed.
- Make a material divergence from the approved plan visible and require renewed confirmation.
- Preserve the ability to draft OpenSpec artifacts, validate them, create the OpenSpec-only PR, and perform read-only investigation before confirmation.

**Non-Goals:**

- Do not solve the broader scoped-rule-placement work in #195 in this change.
- Do not create a rule registry, a mandatory N/A form, a calendar-based review process, or a separate approval artifact.
- Do not change benchmark fixtures, candidates, snapshots, evaluators, runners, treatments, environments, formal records, or model execution.
- Do not make the requester approve routine read-only inspection or the OpenSpec documents themselves before they can be drafted.

## Decisions

### 1. Gate on implementation, not exploration or OpenSpec drafting

The gate starts only after all required OpenSpec artifacts are strict-valid and the initial OpenSpec-only PR exists. It blocks the first non-OpenSpec implementation action: changing policy, code, fixtures, schemas, workflow documents, or other delivery files.

This keeps OpenSpec useful as the proposed contract while ensuring that it is not treated as permission to implement an unconfirmed interpretation. Read-only investigation remains available because it is needed to create an accurate plan and does not impose a repository direction.

### 2. Require both Plan mode and a compact visible plan

The Agent MUST enter the platform's Plan mode where the platform exposes one. The visible plan—not merely the mode label—is the verification surface: it states intended outcome, exact write scope, non-goals, expected behavior, validation/counterexamples, unresolved questions, and next execution steps. A platform without a selectable Plan mode must provide the same labelled plan and wait for confirmation; it cannot bypass the gate because of tooling limitations.

This choice prevents a mechanical “Plan mode” switch from becoming a substitute for usable review, while retaining the user's requested workflow in clients that support it.

### 3. Confirmation is explicit and plan changes are re-confirmed only when material

Implementation begins only after the requester explicitly confirms the presented plan. A changed filename for the same approved edit does not reopen the gate. A change that materially alters declared scope, policy semantics, rule applicability, user-visible behavior, validation strategy, or non-goals does reopen it.

The plan and confirmation must be visible in the current collaboration/PR evidence chain; no separate registry or recurring report is introduced. This records the decision without multiplying maintenance surfaces.

### 4. Keep the stable contract and agent-facing instruction aligned

The stable OpenSpec requirement is the precise, testable contract. Root `AGENTS.md` will receive only a concise operational instruction pointing to the same sequence. This change will not put an exhaustive checklist into the root file or alter the eventual placement of domain-specific rules; that remains the broader #195 scope.

## Risks / Trade-offs

- [The gate can slow a simple process-only change] → Its plan is intentionally compact, excludes OpenSpec drafting/read-only investigation, and only reopens for material changes.
- [“Plan mode” may not be available in every client] → Require the labelled visible-plan equivalent and explicit confirmation, rather than silently waiving the rule.
- [A plan can become stale during implementation] → Material scope or applicability changes must return to planning and confirmation.
- [This change could be mistaken for the complete #195 solution] → Proposal, PR, and later report explicitly state that scoped-rule convergence is not implemented here.

## Migration Plan

1. Strict-validate this change and create an OpenSpec-only PR that references #195.
2. Present the implementation plan to the requester and wait for explicit confirmation.
3. After confirmation, update only root `AGENTS.md` and the stable `openspec-pr-continuity` specification, then complete the listed validation.
4. Keep PR open until tasks are complete; retain #195 for the broader scoped-rule work.

## Open Questions

- None for this small gate. The later #195 scoped-rule design will need separate confirmation of which existing rules are universal versus experimental.
