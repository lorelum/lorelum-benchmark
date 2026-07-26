## Why

Issue #81 follows the completed #75 local candidate validation. That work showed that a Practice can be useful only when it remains reusable guidance: treating a reference file path, helper name, or one error representation as the Practice turns an evaluator detail into hidden task input. The repository needs a reviewable contract for separating task requirements, Practice guidance, hard acceptance gates, and report-only quality signals before more Practice candidates are designed.

## What Changes

- Add a repository-level Practice benchmark boundary contract and a maintainer guide describing five information classes: public task behavior, injected Practice guidance, private semantic acceptance, private quality signals, and implementation preferences.
- Define which checks may reject task completion, which checks may report Practice-related quality, and when a specific interface or location is legitimately a hard contract rather than a naming preference.
- Require candidate calibration to accept a reference and a responsibility-equivalent implementation while rejecting registered anti-patterns.
- Require results to expose human-readable raw counts for task semantics and quality signals separately; do not turn either into a hidden weighted score or a product conclusion.
- Require the guide to include positive and negative classification examples, plus a review matrix that maps each relevant #75 probe assertion to one of the five classes.

## 能力范围

### 新增能力

- `practice-benchmark-boundaries`: Defines the authoring, evaluation, calibration, and reporting boundaries for Practice-injection benchmark candidates.

### 修改能力

无。现有 `login-practice-probe-fixture` 已规定公开/私有隔离和 candidate 生命周期；本 change 新增跨候选的设计约束，而不改写 #75 的已完成本地诊断。

## 影响范围

- Planned documentation: a new maintainer guide under `docs/` and future candidate OpenSpec designs.
- No change in this initial PR to `incubator/`, `suites/`, shared runner, schema, environment, treatment, formal record, or model execution.
- Follow-on candidate or evaluator changes remain separate changes with their own snapshot and lifecycle decisions.
