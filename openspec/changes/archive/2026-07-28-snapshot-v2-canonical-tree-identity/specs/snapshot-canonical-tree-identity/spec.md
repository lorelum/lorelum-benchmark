## ADDED Requirements

### Requirement: 版本化的 canonical 树身份格式

Snapshot v2 SHALL 定义一个版本化、canonical 的源码树身份，替代 v1 的逐文件 manifest 作为新输入的
已提交主存储。Canonicalization MUST 满足：以正斜杠规范化路径，按字典序稳定排序所有条目，仅纳入
常规文件，对每个文件计算字节级 SHA-256，并以确定的 Merkle 式树根摘要组合全部叶节点。同一受管
输入树在跨干净 checkout、不同平台或不同文件系统遍历顺序下 MUST 产生相同的树根摘要与 snapshot 身份。

v2 document MUST 声明 `version: 2` 与所用 canonicalization 算法标识。任何无法解析、版本未知或
schema 错误的 v2 document MUST 在验证前 fail closed。

#### Scenario: 跨干净目录产生相同身份

- **WHEN** 同一受管输入树在两个独立干净 checkout 中被计算 v2 身份
- **THEN** 两者产生相同的树根摘要与 snapshot 身份，且不依赖文件系统遍历顺序或平台路径分隔符

#### Scenario: 错误 schema 被拒绝

- **WHEN** 一个 v2 document 缺失必需字段、声明未知版本或无法解析
- **THEN** 验证 MUST 在消费任何树内容前失败

### Requirement: 内容与结构变更使身份失效

v2 身份 MUST 对受管输入树的任何内容变更、新增、删除或重命名 fail closed。重命名（路径改变）即使
文件字节不变也 MUST 使身份失效，因为 canonical 身份绑定路径与字节的组合。

#### Scenario: 内容变更使身份失效

- **WHEN** 一个受管文件的内容在 snapshot 生成后被修改
- **THEN** v2 验证 MUST 失败

#### Scenario: 新增或删除文件使身份失效

- **WHEN** 一个受管文件在 snapshot 生成后被新增或删除
- **THEN** v2 验证 MUST 失败

#### Scenario: 重命名使身份失效

- **WHEN** 一个受管文件在 snapshot 生成后被重命名（路径改变，字节不变）
- **THEN** v2 验证 MUST 失败

### Requirement: 非法路径与 symbolic link fail closed

Canonicalization MUST 拒绝绝对路径、包含 `.`/`..` 段的路径、空段路径与 symbolic link。遇到
任何上述输入 MUST 在计算树根摘要前失败，且不得产出部分身份。

#### Scenario: 非法路径被拒绝

- **WHEN** 输入树包含绝对路径、遍历段（`..`）或非规范化路径
- **THEN** canonicalization MUST 在产出身份前失败

#### Scenario: symbolic link 被拒绝

- **WHEN** 输入树包含 symbolic link
- **THEN** canonicalization MUST 失败且不得将该链接纳入树根摘要

### Requirement: 生成物排除与 v1 一致

v2 MUST 与 v1 一致地排除 generated-output 目录（`node_modules`、`dist`、`test-results`、
`playwright-report`、`.vite`、`.materialized`、`.practice-runtime`、`.run-workspaces`、
`logs`）与候选执行后才写入的证据索引（`private/evidence-index/`）。snapshot 自身
（`private/snapshot.json`）MUST 被排除。排除规则 MUST 不导致受管源输入被遗漏。

#### Scenario: 生成物目录被排除

- **WHEN** 输入树包含 `node_modules/`、`dist/` 或 `.vite/`
- **THEN** v2 身份不包含这些目录的内容，且身份稳定

#### Scenario: 证据索引不使候选输入快照失效

- **WHEN** 候选输入执行后写入 `private/evidence-index/`
- **THEN** 该写入不改变该输入对应的 v2 身份

### Requirement: v1 与 v2 并存且历史不可重写

v1 snapshot MUST 继续验证现有、retired 与已冻结 revision 的 snapshot 和运行记录，且其行为 MUST NOT
被 v2 改变、重写或重新解释。v2 MUST 作为新输入的可选格式与 v1 并存。版本选择 MUST 由 snapshot
document 的 `version` 字段决定；不存在隐式迁移。冻结或退休 revision 的 v1 snapshot MUST NOT 被
转换为 v2。

#### Scenario: v1 历史快照仍可验证

- **WHEN** 一个已冻结或退休 revision 持有 v1 snapshot
- **THEN** v1 验证继续按原行为通过，且 v2 不修改其 snapshot 或运行记录

#### Scenario: 新输入可选择 v2

- **WHEN** 一个新输入声明 v2 格式
- **THEN** v2 验证路径被使用，且不触及任何 v1 snapshot

### Requirement: source、profile input 与 private payload 边界

v2 MUST 继续以 fail-closed digest 绑定 source commit、resolved profile input hash 与 declared
private payload 身份。对声明 `injection-calibration/v1` profile 的输入，v2 的普通文件树与身份
MUST NOT 包含 Practice 文本或 `private/practices/` 路径；Practice 绑定继续使用已声明的
profile input hash。失配诊断 MUST NOT 向 agent workspace、公开 prompt、trace、普通 snapshot 文件
或生成物泄露 Practice 文本、`private/practices/` 路径、私有 evaluator 或 oracle 内容。

#### Scenario: Practice 内容不进入公开身份

- **WHEN** 一个声明 `injection-calibration/v1` 的输入被计算 v2 身份
- **THEN** 普通文件树与身份不包含 Practice 文本或 `private/practices/` 路径，且 profile input hash 变化使验证失败

#### Scenario: 失配诊断不泄露私有内容

- **WHEN** v2 验证因内容或身份失配而失败
- **THEN** 诊断信息 MUST NOT 包含 Practice 文本、`private/practices/` 路径或私有 evaluator/oracle 内容

### Requirement: 受控失配诊断

v2 MUST 支持在验证失败时按受控方式定位树内不匹配（例如受影响路径与失配类型），但完整逐文件清单
MUST NOT 作为每份新 v2 snapshot 的默认已提交主存储。诊断 MUST 仅在验证失败时按需产出，且受
public/private 泄露规则约束。

#### Scenario: 验证失败定位失配

- **WHEN** v2 验证因内容或结构变更而失败
- **THEN** 诊断在内存中重新展开当前树，输出受管路径与其当前 hash，供定位受影响路径与失配类型，且不泄露私有内容

#### Scenario: 逐文件清单非默认提交主存储

- **WHEN** 一个新 v2 snapshot 被生成
- **THEN** 其已提交主存储为 canonical 树根摘要，而非完整逐文件 manifest