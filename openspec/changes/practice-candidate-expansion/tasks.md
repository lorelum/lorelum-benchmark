## 0. 规划澄清门禁

- [ ] 0.1 与需求方确认 candidate 数量、每题公开可观察行为和技术栈，并写回 issue #89 与 design。
- [ ] 0.2 确认每题的 baseline/oracle-practice/irrelevant-practice 三条件；记录无关对照的固定
  等长计量方式、预期 baseline 缺陷与可区分性。
- [ ] 0.3 确认私有语义硬门槛、仅报告质量 probe、职责等价 calibration、starter/source 提交及
  public/private 泄露审计。
- [ ] 0.4 确认后续 #90/#91 使用的模型、提示、工具、预算、重复次数和盲评边界；明确 #89 不执行模型。

## 1. Candidate 定义

- [ ] 1.1 为每个获批主题建立独立 candidate 的 public 任务与 starter，不泄露 Practice、oracle、
  evaluator 或 reference。
- [ ] 1.2 为每个 candidate 定义私有 conditions、相关/无关 Practice、语义验收、质量 probe 和
  candidate 声明；conditions 固定 baseline/oracle-practice/irrelevant-practice 三条件以及共享
  snapshot、模型、提示、工具、预算、重复次数和工作区策略，质量 probe 仅测职责边界。
- [ ] 1.3 为每个 candidate 创建 reference、职责等价、public starter 和 anti-pattern calibration，
  并记录预期结果：starter 与 anti-pattern 在语义通过时失败质量 probe。
- [ ] 1.4 生成 candidate snapshots，确认它们不包含生成输出或 public/private 泄露。

## 2. 验证与交接

- [ ] 2.1 在不调用模型的情况下运行每个 candidate 的 calibration、snapshot 验证和泄露审计。
- [ ] 2.2 运行 `bun run validate` 与 strict OpenSpec validation，并在 PR 保留验证证据和未执行原因。
- [ ] 2.3 将已校准 candidate 及 #94 preflight 语义的集成要求交接给 #90；#90 必须复用或抽取该
  preflight，并验证失败时不进入任一 candidate 执行循环。不创建 scratch 结果、record 或正式 suite
  revision。
