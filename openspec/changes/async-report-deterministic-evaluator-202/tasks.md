## 1. Planning and scope gate

- [ ] 1.1 在 Issue #202 中逐项确认本 change 的四个 Open Questions：黑盒验收面、public-starter 预期失败范围、`pass|fail|indeterminate`/exit code 契约，以及 #200 只可引用 check id 与状态摘要。
- [ ] 1.2 将确认结果写回 `design.md`、必要的 delta spec 和本 `tasks.md`，并再次运行 strict validation；未确认前不得开始任何非 OpenSpec 实现。
- [ ] 1.3 写入范围保持 `openspec/changes/async-report-deterministic-evaluator-202/`、`incubator/practice-injection/async-report-lifecycle-v1/private/evaluator/v1/` 和必要的版本化 `src/benchmark/` helper；禁止修改 public task/starter、`private/candidate.yaml`、#196 `private/snapshot.json`、#197 runner、#199 treatment 或 #200 JudgeAgent。

## 2. Evaluator identity and result contract

- [ ] 2.1 创建 `private/evaluator/v1/` 目录、evaluator manifest、source snapshot 生成/校验入口，并固定 candidate id、#196 source commit 和 snapshot id。
- [ ] 2.2 定义 `async-report-deterministic-evaluator/v1` 结果类型、九个稳定 check id、逐检查 `pass|fail|indeterminate` 状态、稳定 reason 和 `0|1|2` exit code。
- [ ] 2.3 实现 identity/oracle/fixture/source hash 预检；任何漂移、缺失、解析失败或不完整输出必须返回 `indeterminate`，不得降级为 `fail` 或 `pass`。
- [ ] 2.4 增加 identity、结果 schema、exit code 和不完整输出的 focused tests。

## 3. Black-box behavior checks

- [ ] 3.1 实现临时 workspace、自动端口 HTTP server 和 worker CLI 测试 harness；不得依赖墙钟延迟、随机失败、外部网络或模型。
- [ ] 3.2 实现 `lifecycle-queued-processing-completed`、`lifecycle-failure-and-retry`、`progress-persistence`、`pause-at-checkpoint` 和 `resume-preserves-progress`。
- [ ] 3.3 实现 `v1-v2-overlap-preserves-safe-state`、`rollback-preserves-extension-fields`、`unsafe-state-preserved-and-rejected` 和 `concurrent-workers-serialize-progress`。
- [ ] 3.4 确保检查只依赖公开 API/worker 行为和持久化结果，不解析 reference 目录、类名、函数名、模块数或 dataflow 形状。
- [ ] 3.5 增加每个 check 的正向、定向失败和不确定结果单元测试。

## 4. Private fixtures and calibration

- [ ] 4.1 建立 `oracle.yaml`，把稳定 check id 映射到公开 requirement、失败类别和 fixture expectation。
- [ ] 4.2 建立 `fixtures/manifest.yaml` 与 base+overlay 机制，记录 #196 snapshot、每个 overlay 文件和 SHA-256；不得复制可漂移的整套 public starter。
- [ ] 4.3 添加 reference 与结构等价的 equivalent fixture，证明九个检查逐项一致且不绑定 reference 布局。
- [ ] 4.4 添加 public-starter expectation，明确哪些 lifecycle/progress/pause 检查通过、哪些兼容/回退检查必须失败。
- [ ] 4.5 为每个稳定 check id 提供至少一个 negative/mutation fixture，并断言失败落在目标 check。
- [ ] 4.6 实现 calibration runner，输出逐 fixture/逐 check 矩阵；reference、equivalent 或 mutation 判别力不足时以非零状态失败。

## 5. Deterministic validation and privacy audit

- [ ] 5.1 增加 evaluator CLI/package script 入口，使 candidate workspace 可通过同一命令执行，不接收 condition、delivery node、Pack、Practice 或 Judge 参数。
- [ ] 5.2 增加 public/private leakage audit，检查 evaluator、oracle、fixtures、私有路径和结果全文不会进入 public task/starter、公开 trace 或 Judge allowlist。
- [ ] 5.3 验证 evaluator 在 timeline conditions 的输入完全相同；任何 condition-aware 分支、Practice provenance 读取或 rubric 依赖均视为失败。
- [ ] 5.4 运行 focused evaluator tests、完整 calibration、identity/snapshot verification、`bun run validate` 和 `git diff --check`，并记录命令、结果和未执行原因。

## 6. Review, lifecycle, and delivery

- [ ] 6.1 确认 #196 public task/starter 与 `private/snapshot.json` 逐字节不变，#202 candidate 仍未进入 suite、未创建 record、未调用模型。
- [ ] 6.2 按 `docs/PR_REVIEW.md` 完成两轮独立只读 review，将证据保存在本 change 的 `verification/` 下；发现问题时仍在同一 PR/change 内修复并复审。
- [ ] 6.3 回读 GitHub 实际保存的 Issue/PR 标题、正文和重要评论，更新 Issue #202 的实现、验证、未决风险与下一步状态。
- [ ] 6.4 将可实施性、验证证据、剩余风险和是否满足 #201 前置条件写回 issue；本 change 不自身授权 #201 模型运行或正式结论。
