## Why

#143 登录页三条件诊断 pilot（#137）修正设计后的复测暴露一条对后续 candidate 设计通用的经验：
**被测 Practice 的基本行为要求必须写进 task（让基线也能产出该行为）**，否则 judge 0 分测的是
「模型是否自发分层」而非「practice 是否提升规范度」；同时低分必须能从代码追溯到具体缺失维度，
才能与「模型识破测试环境」区分。该经验应写入 stable spec 供后续 candidate 对照。

## What Changes

- `practice-benchmark-boundaries` 新增 requirement：任务须声明被测 Practice 的基本行为要求；
  candidate design 须记录预期基线符合水平与 Practice 增量；低分（含 0 分）须可从代码追溯到
  具体缺失维度（task 要求未产出 vs practice 专属细化未满足），不得解释为环境识别。
- `login-page-task-headroom` 修订「task 不得含分层提示」条款为「task 须给出被测行为的基本
  要求（基线预期可产出），细化约定（翻译/响应隔离等）由 Practice 注入提供」。

## Impact

- `openspec/specs/practice-benchmark-boundaries/spec.md`：+1 requirement。
- `openspec/specs/login-page-task-headroom/spec.md`：修订 1 条 requirement 的措辞。
- 范围：#149。不改 runner/judge 代码、不重跑 pilot、不创建正式 record。
