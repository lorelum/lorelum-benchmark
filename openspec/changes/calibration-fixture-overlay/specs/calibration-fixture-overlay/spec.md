## ADDED Requirements

### Requirement: 版本固定的 calibration fixture 合成
Kernel-backed calibration fixture SHALL support a committed, repository-local
base plus committed override declaration that resolves to one deterministic tree.
The declaration MUST pin the base with a digest, normalize and sort every
resolved path, and reject missing bases, digest mismatches, absolute or escaping
paths, generated-output paths, symbolic links, ambiguous conflicts and cycles.

#### Scenario: 基座和 override 合成成功
- **WHEN** a fixture declares an existing digest-matching base and valid
  non-conflicting overrides
- **THEN** the resolver returns the same canonical composed manifest and tree
  hash regardless of filesystem enumeration order or consumer entry point

#### Scenario: 解析遇到不可信输入
- **WHEN** a base is absent, its digest differs, a path is illegal, a conflict
  is ambiguous, or a declaration creates a cycle
- **THEN** resolution MUST fail before materialization, isolation, calibration
  or snapshot can consume any partial tree

### Requirement: 合成树身份绑定 snapshot v1
For every candidate that declares a calibration fixture overlay, snapshot v1 MUST record a resolved composite-fixture identity computed from the canonical
declaration, pinned base and final composed file hashes. Snapshot verification
MUST re-resolve the same tree and fail when the base, override or composition
result changes.

#### Scenario: 基座在快照后被改动
- **WHEN** a committed base file is modified after a candidate snapshot is
  written
- **THEN** snapshot verification MUST fail because its pinned or composite
  identity no longer matches

#### Scenario: override 在快照后被改动
- **WHEN** an override file or its declaration is modified after a candidate
  snapshot is written
- **THEN** snapshot verification MUST fail because the composite identity no
  longer matches

### Requirement: 所有消费者共享合成解析结果
Materialization, isolation, the calibration driver/evaluator and snapshot MUST
use the same versioned resolver and MUST agree on the composed manifest and
tree hash for one declaration. Calibration execution MUST use the composed
fixture tree rather than its source fragments.

#### Scenario: 四个消费者解析同一 fixture
- **WHEN** a valid overlay fixture is materialized, isolated, evaluated and
  snapshotted
- **THEN** each consumer observes the identical composed manifest and tree hash

### Requirement: 私有 calibration 与 Practice 隔离
The composed calibration tree MUST remain private calibration input. The system
MUST NOT copy Practice text, `private/practices/` paths, private evaluator or
private-only fixture content into an agent workspace, public prompt, trace,
ordinary snapshot file list or generated artifact.

#### Scenario: 对合成 fixture 执行泄露审计
- **WHEN** isolation and snapshot process a candidate with an overlay fixture
- **THEN** they reject private leakage and omit Practice text and
`private/practices/` paths from agent-visible and ordinary snapshot outputs
