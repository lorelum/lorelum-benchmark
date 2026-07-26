## 1. 设计与条件

- [x] 1.1 回读 Issue #75、#73/#77 与 candidate，确认本 change 只处理本地探索性小试。
- [x] 1.2 创建关联 #75、仅含 OpenSpec artifacts 的初始 PR #78。
- [x] 1.3 写回负责人确认：三条件各两次、使用本机 Pi、结果保存在 `scratch/`；不要求不可变存储、盲评、正式 record 或发布级证据。
- [x] 1.4 更新 `conditions.yaml` 的 source commit 和预算，并重新生成 candidate snapshot。

## 2. 本地执行器

- [x] 2.1 实现 candidate 私有执行器：解析条件、创建干净公开工作区、注入 Practice、调用 Pi、运行 evaluator 并写入本地摘要。
- [x] 2.2 为 dry-run、输出目录边界和工作区不含 private 文件添加聚焦测试。
- [x] 2.3 运行 candidate snapshot、OpenSpec strict validation 与 `bun run validate`。

## 3. 本地比较

- [x] 3.1 使用本机 Pi `0.80.10` 与 `deepseek/deepseek-v4-pro` 运行三条件各两次；不运行 retrieval，不创建正式 record。最终已校准输出位于被忽略的 `scratch/login-practice-local/issue-75-practice-defined-calibrated-2026-07-26/`。
- [x] 3.2 最终六次中，三组的登录语义测试均为 2/2 通过；baseline 的 API 分层质量 probe 为 0/2、Oracle Practice 为 2/2、无关 Practice 为 0/2。因而“登录语义与 API 分层质量均通过”的次数依次为 0/2、2/2、0/2，Oracle 严格领先，标记为有信号。该结果仅为本地候选诊断。
