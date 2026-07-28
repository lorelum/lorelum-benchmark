## 0. 规划澄清门禁

- [x] 0.1 与需求方确认 candidate 数量、每题公开可观察行为和技术栈，并写回 issue #89 与 design。
- [x] 0.2 确认每题的 baseline/oracle-practice/irrelevant-practice 三条件；记录无关对照的固定
  等长计量方式、预期 baseline 缺陷与可区分性。
- [x] 0.3 在 #102 合并后提交不含生成物的 candidate source seed，并在 declaration/snapshot 中
  固定该 commit；确认私有语义硬门槛、仅报告质量 probe、职责等价 calibration 与泄露审计。
- [x] 0.4 固定 #90 的初始执行边界：Pi 0.80.10、DeepSeek v4 Pro、无额外系统提示、同一工具
  策略、十分钟、每条件两次、无盲评；#89 不执行模型。#91 必须以新的固定计划扩大
  candidate/Practice 样本数量和重复次数，不能覆盖该初始边界。

## 1. Candidate 定义

- [x] 1.1 为每个获批主题建立独立 candidate 的 public 任务与 starter，并创建不含生成物的 source
  seed commit；不泄露 Practice、oracle、evaluator 或 reference。
- [x] 1.2 为每个 candidate 定义 `core/v1` + `injection-calibration/v1` + `react-vite` kernel
  声明，以及 profile v1 私有 conditions、相关/无关 Practice metadata、语义验收和质量 probe；
  conditions 固定三条件和共享执行输入，质量 probe 仅测职责边界。
- [x] 1.3 为每个 candidate 创建 reference、职责等价、public starter 和 anti-pattern calibration，
  并记录预期结果：starter 与 anti-pattern 在语义通过时失败质量 probe。
- [x] 1.4 生成 candidate snapshots，确认 resolved profile-input hash 已固定，完整 manifest 不含
  `private/practices/`、生成输出或 public/private 泄露。

## 2. 验证与交接

- [x] 2.1 在不调用模型的情况下运行每个 candidate 的 calibration、snapshot 验证和泄露审计。
- [x] 2.2 运行 `bun run validate` 与 strict OpenSpec validation，并在 PR 保留验证证据和未执行原因。
- [x] 2.3 将已校准 candidate、source commit、snapshot ID、profile-input hash 与 #94 preflight
  语义交接给 #90；#90 必须使用 profile-aware adapter，并验证失败时不进入任一 candidate 执行
  循环。不创建 scratch 结果、record 或正式 suite revision。
