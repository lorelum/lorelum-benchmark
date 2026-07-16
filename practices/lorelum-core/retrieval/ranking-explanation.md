---
id: lorelum.retrieval.ranking-explanation
title: Explain a Retrieval Result Without Changing Its Rank
title_zh: 在不改变排序的前提下解释检索结果
domain: retrieval
stage: [review, refactor]
tech_stack: [typescript, bun]
applies_when: adding diagnostics that explain why Lorelum returned a Practice after ranking has already selected candidates
applies_when_zh: 在排序已经选出候选后，为 Lorelum 的 Practice 检索结果增加可解释诊断时
status: draft
related: []
tags: [retrieval, ranking, diagnostics, explanation]
last_reviewed: 2026-07-16
---

# Explain a Retrieval Result Without Changing Its Rank

## When to apply

Use this after a retrieval pipeline has already selected and ordered candidates
and users need to understand the result. It applies to diagnostics, logs, and
review output; it does not define the metadata parsing contract.

## Core guidance

### Preserve the selected order

Capture the score and selected candidate before creating explanation text. An
explanation layer may describe filters, metadata matches, and ranking signals,
but it must not sort, deduplicate, or silently replace the ranked result.

```ts
export function explainResult(result: { id: string; score: number }) {
  return {
    practiceId: result.id,
    score: result.score,
    reasons: ['selected by the existing ranking pipeline'],
  };
}
```

### Describe signals, not hidden chain-of-thought

Expose stable product signals such as matching stage, technology, or explicit
filter. Do not synthesize private model reasoning or claim a causal certainty
the ranker cannot provide. Missing evidence should be reported as missing.

```ts
export function metadataReasons(matches: { stage: boolean; stack: boolean }) {
  return [
    ...(matches.stage ? ['stage metadata matched'] : []),
    ...(matches.stack ? ['technology metadata matched'] : []),
  ];
}
```

### Keep diagnostics optional

The normal retrieval path should not depend on a diagnostic formatter succeeding.
Return the ranked result first; append explanation data only when the caller
asks for it and propagate formatter errors as diagnostics, not altered rankings.

## Tradeoffs

- **Ranking changes:** when a new signal should affect order, change the ranker
  in a separately evaluated task. Mixing it with explanation makes regressions
  impossible to attribute.
- **Sensitive inputs:** redact user content and secrets before creating logs;
  explanation does not justify persisting raw prompts.

## Anti-patterns

- **retrieval.explanation-reranks-result** — the diagnostic layer changes the
  candidate order it was supposed to explain.
- **retrieval.fabricated-ranking-reason** — presenting unsupported reasoning as
  a ranking fact.
- **retrieval.diagnostics-required-for-result** — failing a normal retrieval
  because optional explanation formatting failed.
