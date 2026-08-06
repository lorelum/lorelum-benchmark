## Context

#143 修正版复测（2026-08-06，18 attempts）：task 含分层要求时 baseline joint_pass 1/5、
oracle 3/5、irrelevant 2/6，judge 中位 baseline 0 vs oracle 100。关键经验：task 提示强度决定
baseline 能否产出被测行为；评分公平性要求「低分可解释」——0 分必须能追溯到组件持有
transport/原始响应等具体缺失维度，且不能与「模型识破测试环境」混淆（环境识别为事后被动审计）。

## Goals / Non-Goals

**Goals：**
- 把「task 声明被测行为基本要求 + 记录预期基线 + 低分可解释」写入 stable spec，供后续
  candidate 设计对照。
- 修订 headroom spec 与本次需求方决策（2026-08-06：task 应含基本分层要求）冲突的条款。

**Non-Goals：** 不改 runner/judge 代码；不重跑 pilot；不创建正式 record。

## Decisions

- 落点：`practice-benchmark-boundaries`（通用 candidate 规范）+ `login-page-task-headroom`
  （修订冲突条款）。
- 措辞：task MUST 声明被测 Practice 的基本行为要求（基线预期可产出）；细化约定（翻译、
  响应隔离、命名等）由 Practice 注入提供；candidate design MUST 记录预期基线符合水平与
  Practice 增量；任何低分 MUST 可从代码追溯到缺失的 rubric 维度。

## Migration Plan

1. OpenSpec-only 初始 PR（Refs #149）。
2. 实现：编辑两条 stable spec + change spec；`bun run validate` + OpenSpec strict。
3. 归档后合并。
