## 1. Planning and scope gate

- [x] 1.1 在 Issue #202 中逐项确认：黑盒验收面、public-starter 预期失败范围、`pass|fail|indeterminate`/exit code 契约、独立 evaluator v1 身份、base+overlay fixtures，以及 #200 只可引用 check id 与聚合状态。
- [x] 1.2 将确认结果写回 `design.md`、delta spec 和本 `tasks.md`，并再次运行 strict validation。
- [x] 1.3 写入范围保持 `openspec/changes/async-report-deterministic-evaluator-202/`、`incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/`、同包仓库级 `private/snapshot.json` 和必要的版本化 `src/benchmark/` helper；禁止修改 public task/starter、`private/candidate.yaml`、#196 `private/snapshot.json`、#197 runner、#199 treatment 或 #200 JudgeAgent。
- [x] 1.4 将重写后的最终计划提交给需求方审阅；只有获得明确实施指令后才从 2.1 开始编码。

## 2. Evaluator identity and result contract

- [x] 2.1 创建 `evaluate.ts`、`evaluator.yaml`、`identity.ts`、`result.ts`、`harness.ts`、`checks/`、`calibration/`、evaluator v1 `snapshot.json` 和 sibling package `private/snapshot.json`；固定 candidate id、#196 source commit 与 snapshot id。
- [x] 2.2 定义 `async-report-deterministic-evaluator/v1` 结果类型、九个稳定 check id、逐检查 `pass|fail|indeterminate` 状态、稳定 reason 和 `0|1|2` exit code；overall 按 `indeterminate > fail > pass` 计算。
- [x] 2.3 实现 evaluator source、oracle、fixture manifest 和 overlay hash 预检；任何漂移、缺失、解析失败或不完整输出必须返回 `indeterminate`，不得降级为 `fail` 或 `pass`。
- [x] 2.4 增加 identity、结果 schema、exit code 和不完整输出的 focused tests。
- [x] 2.5 明确 v1 在 #202 PR 合并时冻结；PR 合并后任何检查、oracle、fixture 或结果语义变化创建 `private/evaluator/v2/`，不原地改写 v1。

## 3. Black-box behavior checks

- [x] 3.1 实现只读投影到临时 workspace、端口 `0` HTTP server、worker CLI 和有界启动/退出 timeout 的 harness；不得依赖墙钟语义等待、随机失败、外部网络或模型。
- [x] 3.2 实现 `lifecycle-queued-processing-completed`、`lifecycle-failure-and-retry`、`progress-persistence`、`pause-at-checkpoint` 和 `resume-preserves-progress`。
- [x] 3.3 实现 `v1-v2-overlap-preserves-safe-state`、`rollback-preserves-extension-fields`、`unsafe-state-preserved-and-rejected` 和 `concurrent-workers-serialize-progress`；overlap 必须继续并保留全部未知顶层字段，rollback 可保留继续或稳定拒绝且字节不变。
- [x] 3.4 确保检查只依赖公开 API/worker 行为和持久化结果，不解析 reference 目录、类名、函数名、模块数或 dataflow 形状。
- [x] 3.5 增加每个 check 的正向、定向失败和不确定结果单元测试；只在公开契约已有精确 code 时断言 code，不匹配 summary 文案。

## 4. Private fixtures and calibration

- [x] 4.1 建立 `oracle.yaml`，把稳定 check id 映射到公开 requirement、失败类别和 fixture expectation。
- [x] 4.2 建立 `fixtures/manifest.yaml` 与 base+overlay 机制；以 #196 public starter 为唯一 base，记录 source commit、snapshot id、每个 overlay 文件和 SHA-256，不得复制整套 public starter。
- [x] 4.3 添加最小修复 reference 和从 public-starter 独立实现的 equivalent fixture，证明九个检查逐项一致且不绑定 reference 布局或兼容策略。
- [x] 4.4 添加 public-starter expectation，明确哪些 lifecycle/progress/pause 检查通过、哪些兼容/回退检查必须失败。
- [x] 4.5 为每个稳定 check id 提供继承 reference 的 whole-file mutation fixture，并用完整 nine-check expectation matrix 断言只有目标 check 失败且其余八项通过。
- [x] 4.6 实现 calibration runner，输出逐 fixture/逐 check 矩阵；reference、equivalent 或任一 mutation 判别力不足、出现未声明额外失败时以非零状态失败。

## 5. Deterministic validation and privacy audit

- [x] 5.1 增加私有自包含 `evaluate.ts <agent-app-root>` 入口，不修改根 `package.json` 或 #197 runner，不接收 condition、delivery node、Pack、Practice 或 Judge 参数。
- [x] 5.2 增加 public/private leakage audit，检查 evaluator、oracle、fixtures、私有路径和结果全文不会进入 public task/starter、公开 trace 或 Judge allowlist。
- [x] 5.3 验证 evaluator 在 timeline conditions 的输入完全相同；任何 condition-aware 分支、Practice provenance 读取或 rubric 依赖均视为失败。
- [x] 5.4 运行 focused evaluator tests、完整 calibration、identity/snapshot verification、`bun run validate` 和 `git diff --check`，并记录命令、结果和未执行原因。
- [x] 5.5 确认 #201 可在 private artifacts 中保存完整结果，#200 只接收 evaluator version、overall status 与稳定 check id 集合。

## 6. Review, lifecycle, and delivery

- [x] 6.1 确认 #196 public task/starter 与 `private/snapshot.json` 逐字节不变，#202 candidate 仍未进入 suite、未创建 record、未调用模型。
- [x] 6.2 按 `docs/PR_REVIEW.md` 完成两轮独立只读 review，将证据保存在本 change 的 `verification/` 下；发现问题时仍在同一 PR/change 内修复并复审。
- [ ] 6.3 回读 GitHub 实际保存的 Issue/PR 标题、正文和重要评论，更新 Issue #202 的实现、验证、未决风险与下一步状态。
- [ ] 6.4 将可实施性、验证证据、剩余风险和是否满足 #201 前置条件写回 issue；本 change 不自身授权 #201 模型运行或正式结论。
- [ ] 6.5 合并前确认 evaluator v1 已冻结；合并后如需修正 semantic behavior、oracle 或 fixture，创建 v2 而不修改 v1。
