## Why

`judge-agent/generic/v2` can generate task rubrics and score candidate code, but its practical guidance still reflects earlier code-quality studies. A future study may need deterministic outcome metrics, human review, LLM judgment, a combination of these, or no Judge at all. Issue #198 designs how JudgeAgent can adapt its evaluation help to the research question instead of treating “generic” as “one rubric for more code tasks.”

## What Changes

- Define a research-scoped workflow that reads the confirmed issue/OpenSpec, asks about decision-critical gaps, and proposes suitable evaluation methods, evidence, limits, and validation.
- Allow the future JudgeAgent, after the researcher approves an evaluation plan, to draft evaluator/analysis code that consumes already approved evidence. Drafts require human review and may not modify runner instrumentation, tasks, or environments.
- Define when subjective LLM scoring is useful, when deterministic or human evaluation is preferable, and how study-specific calibration, blinding, privacy, and provenance apply.
- Use #200 and #192 as non-normative design walkthroughs: one for blinded LLM soft scoring and one for deterministic comparison without an LLM Judge. They are not a proof of generality or a catalogue of supported studies.
- Keep this change design-only. Implementing the future capability requires a separate issue and OpenSpec change.

## Capabilities

### New Capabilities

- `judge-agent-research-evaluation`: Research-question-driven evaluation planning, optional LLM scoring, and human-reviewed evaluator/analysis code drafts over approved existing evidence.

### Modified Capabilities

- None. Existing `judgeagent-soft-scoring` and `benchmark-outcome-contract` remain unchanged and authoritative for public-only Judge input and soft-signal semantics.

## Impact

- **Design evidence:** `src/benchmark/judge/judge-agent/generic/v2/{rubric,score,calibrate,provider}.ts`, `src/benchmark/judge/input.ts`, and historical issues #132/#133/#146/#153.
- **Non-normative walkthroughs:** #200 demonstrates a blinded task-specific LLM soft score; #192 demonstrates a deterministic comparison that explicitly does not use an LLM Judge.
- **Future implementation only:** a separately versioned research-evaluation workflow and its provenance/tool-draft interfaces. No provider, evaluator, schema, runner, instrumentation, fixture, task, model call, or record changes are made here.
- **Unaffected:** #200’s task-specific rubric and current MVP; #192’s deterministic screen; `generic/v1`, `generic/v2`, `judge-result/v1`, semantic hard gates, and historical results.
