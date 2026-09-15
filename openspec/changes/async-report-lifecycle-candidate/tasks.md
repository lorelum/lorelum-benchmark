## 0. OpenSpec、初始 PR 与规划澄清门

- [x] 0.1 在 `openspec/changes/async-report-lifecycle-candidate/` 保持 proposal、design、spec 和 tasks 与 Issue #196 的单一声明范围一致；确认本 change 只覆盖 candidate fixture/公开会话脚本，不吸收 #197、#199、#200、#202 或 #201 的实现。
- [x] 0.2 运行 `openspec validate async-report-lifecycle-candidate --type change --strict --json`，在任何 candidate fixture、模型调用或正式记录创建前修复所有 strict validation 问题。[写入范围：`openspec/changes/async-report-lifecycle-candidate/`]
- [x] 0.3 从最新 `origin/main` 的 `codex/async-report-lifecycle-candidate` 分支创建只包含 OpenSpec artifacts 和必要流程约束的初始 PR；PR 标题和正文引用 Issue #196，并明确当前不包含 fixture、runner、evaluator、模型运行或结果记录。[写入范围：Git branch/PR metadata]
- [ ] 0.4 在初始 PR 创建后完成规划澄清：确认首个实现检查点、starter 依赖/持久化边界、兼容/回退最小可观察行为、baseline 缺陷与区分度、Practice delivery 形式、#201 条件矩阵和不可变 starter source；将确认结果写回 Issue #196、`design.md` 和本文件。[写入范围：Issue #196、`openspec/changes/async-report-lifecycle-candidate/design.md`、`tasks.md`]

## 1. Candidate 公共任务与 starter

- [ ] 1.1 创建 `incubator/practice-injection/async-report-lifecycle-v1/` 的 candidate 元数据，声明 `candidate` 生命周期、source repository、规划确认后的 starter source commit、版本和后续 snapshot 路径；不得加入 suite manifest。[写入范围：`incubator/practice-injection/async-report-lifecycle-v1/private/candidate.yaml`]
- [ ] 1.2 编写公开多回合任务脚本：初始检查/方案阶段、用户补充旧新并行与回退约束阶段、复查后实施/验证阶段；明确已确认的 `first_implementation_checkpoint`，但不泄露 private oracle 或 Practice 正文。[写入范围：`incubator/practice-injection/async-report-lifecycle-v1/public/task.md`]
- [ ] 1.3 创建可运行 public starter，覆盖排队、处理中、完成/失败、分段 worker、持久化进度、checkpoint-bound pause/resume，以及旧新 reader/writer 并行和应用回退的数据安全上下文；依赖和锁文件必须可从已确认的 immutable source 重建。[写入范围：`incubator/practice-injection/async-report-lifecycle-v1/public/starter/`]
- [ ] 1.4 为 starter 添加不包含 private oracle 的 focused behavior checks，验证公开契约的基本可运行性和可观察状态；检查应可离线运行且不调用 LLM 或 Judge provider。[写入范围：`incubator/practice-injection/async-report-lifecycle-v1/public/starter/` 或候选专用测试入口]

## 2. Snapshot、隔离与候选验证

- [ ] 2.1 创建最小 private candidate provenance 和 SHA-256 snapshot，覆盖 public task、starter、candidate metadata 及其声明的源码文件；不得把 evaluator、oracle、scoring 或 Practice 内容添加到 Agent 输入。[写入范围：`incubator/practice-injection/async-report-lifecycle-v1/private/candidate.yaml`、`private/snapshot.json`]
- [ ] 2.2 执行 public/private 泄露审计，确认 Agent workspace 只由 `public/task.md` 和 `public/starter/` 构成；确认公开题面没有完整兼容验收清单、reference implementation 偏好或 Practice 文本。[写入范围：审计证据放入候选验证产物，不提交运行日志]
- [ ] 2.3 运行候选 focused tests、snapshot verification、`bun run validate` 和 `git diff --check`；确认没有模型调用、正式 record、suite revision、run workspace 或生成日志被提交。[写入范围：验证命令及必要的源码修复]
- [ ] 2.4 若行为夹具不能区分正确、表面正确和错误方案，停止升级并在 Issue #196/OpenSpec 中记录 diagnostic/indeterminate；不得为了得到分离度而修改题面、oracle 或条件。[写入范围：Issue #196、`design.md`、候选状态]

## 3. 交接与生命周期收束

- [ ] 3.1 记录供后续 #199、#197、#202、#200 消费的最小公开 contract：任务阶段、首个实现检查点、可观察行为边界和 candidate snapshot identity；不实现这些 issue 的 runner、treatment、evaluator 或 JudgeAgent。[写入范围：`design.md`、候选 provenance]
- [ ] 3.2 复核 candidate 仍未进入 `suites/`、active suite、formal experiment plan 或 `results/records/`，并在同一 PR 中保留验证证据和未执行的正式运行原因。[写入范围：PR body、OpenSpec task evidence]


