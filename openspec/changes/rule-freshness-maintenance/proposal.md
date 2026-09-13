## Why

Repository rules have accumulated through valid responses to concrete benchmark work, but readers cannot see when the current guidance was last reviewed. A completed task also has no lightweight, consistent way to say whether it confirmed the rules, required a correction, or left an unresolved follow-up. This makes it too easy either to keep applying stale language or to add another narrow rule when a previous rule should have been revised.

## What Changes

- Add a visible “last reviewed” marker and a small, event-driven rule-review loop to the root workspace instructions.
- Clarify that planning confirmation is required when a benchmark change creates or changes experimental decisions; implementation that only carries out an already-recorded decision cites that decision instead of re-opening unrelated choices.
- Make the contributor path state that fixture instructions begin after the applicable repository process has been satisfied.
- Replace the remaining placeholder purpose in the OpenSpec continuity specification with its actual scope.

## Capabilities

### New Capabilities

<!-- None. This change maintains an existing workflow rather than adding a separate governance system. -->

### Modified Capabilities

- `openspec-pr-continuity`: clarify when planning confirmation applies and add lightweight review feedback for repository rules.

## Impact

- `AGENTS.md`
- `CONTRIBUTING.md`
- `openspec/specs/openspec-pr-continuity/spec.md`
- No suite, task, schema, evaluator, runner, treatment, environment, model invocation, record, or benchmark-result change.