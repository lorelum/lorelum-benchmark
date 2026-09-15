## 0. OpenSpec、初始 PR 与规划澄清门

- [x] 0.1 在 `openspec/changes/async-report-lifecycle-candidate/` 保持 proposal、design、spec 和 tasks 与 Issue #196 的单一声明范围一致；确认本 change 只覆盖 candidate fixture/公开会话脚本，不吸收 #197、#199、#200、#202 或 #201 的实现。
- [x] 0.2 运行 `openspec validate async-report-lifecycle-candidate --type change --strict --json`，在任何 candidate fixture、模型调用或正式记录创建前修复所有 strict validation 问题。[写入范围：`openspec/changes/async-report-lifecycle-candidate/`]
- [x] 0.3 从最新 `origin/main` 的 `codex/async-report-lifecycle-candidate` 分支创建只包含 OpenSpec artifacts 和必要流程约束的初始 PR；PR 标题和正文引用 Issue #196，并明确当前不包含 fixture、runner、evaluator、模型运行或结果记录。[写入范围：Git branch/PR metadata]
- [x] 0.4 在初始 PR 创建后完成规划澄清：已确认 Bun 服务+文件快照、版本化 HTTP API、旧新 API/worker、固定三 segment、checkpoint 证据、baseline 预期缺陷、public docs、Practice 不物化、#201 条件由后续 change 冻结和 immutable source 规则；结果已写回 Issue #196、本文件和 `design.md`。[写入范围：Issue #196、`design.md`、`tasks.md`]

## 1. Candidate 公共任务与 starter

- [x] 1.1 创建 `incubator/practice-injection/async-report-lifecycle-v1/` 的 candidate 元数据，声明 `candidate` 生命周期、source repository、runtime、baseline expectation、starter source commit 和 snapshot 路径；不得加入 suite manifest。[写入范围：`incubator/practice-injection/async-report-lifecycle-v1/private/candidate.yaml`]
- [x] 1.2 编写公开多回合任务脚本：初始检查/方案阶段、stage-2 用户补充旧新并行与回退约束、复查后实施/验证阶段；明确 `CHECKPOINT: compatibility-slice-ready` 和 `bun test tests/compatibility.test.ts` 聚焦测试证据，不泄露 private oracle 或 Practice 正文。[写入范围：`public/task.md`、`public/stage-2/task.md`]
- [x] 1.3 创建可运行 Bun public starter：版本化 v1/v2 HTTP JSON API、每 report 一个原子状态文件、固定三个 segment、独立 worker CLI、pause/resume、确定性 failure 和从 checkpoint retry；保留旧版完整路径和新版迁移/回退缺口作为 baseline。[写入范围：`public/starter/app/`]
- [x] 1.4 在 starter docs 中公开 API、状态字段、版本差异和 worker CLI；不写 hidden oracle、完整迁移答案、评分配置或 Practice 内容。[写入范围：`public/starter/app/docs/`]
- [x] 1.5 添加黑盒 HTTP/持久化 focused tests，覆盖生命周期、pause checkpoint、进度持久化、failure/retry、v1/v2 并行、未知字段保留目标和可诊断安全错误；兼容性目标测试允许在 baseline 阶段失败，但必须成为 Agent 的公开验证入口。测试不绑定 private evaluator 或特定 reference 目录结构。[写入范围：`public/starter/app/tests/`]

## 2. Snapshot、隔离与候选验证

- [x] 2.1 创建最小 private candidate provenance 和 SHA-256 snapshot，覆盖 public task、starter、candidate metadata 及其声明的源码文件；不得把 evaluator、oracle、scoring 或 Practice 内容添加到 Agent 输入。[写入范围：`private/candidate.yaml`、`private/snapshot.json`]
- [x] 2.2 执行 public/private 泄露审计，确认 Agent workspace 只由 public task/stage-2/starter 构成；确认公开材料没有 hidden assertion、reference implementation 偏好或 Practice 文本。[写入范围：审计命令和 PR 证据，不提交运行日志]
- [x] 2.3 运行 candidate focused tests、snapshot verification、`bun run validate` 和 `git diff --check`；确认没有模型调用、正式 record、suite revision、run workspace 或生成日志被提交。[写入范围：验证命令及必要的源码修复]
- [x] 2.4 完成本次 candidate-level 行为边界复核：未执行模型/calibration/promote，candidate 保持 `candidate`；区分度校准和 promotion gate 明确移交 #202，不通过本 change 预先宣称实验结论。[写入范围：Issue #196、`design.md`、PR evidence][写入范围：Issue #196、`design.md`、候选状态]

## 3. 交接与生命周期收束

- [x] 3.1 记录供后续 #199、#197、#202、#200 消费的最小公开 contract：任务阶段、checkpoint、可观察行为边界和 candidate snapshot identity；不实现这些 issue 的 runner、treatment、evaluator 或 JudgeAgent。[写入范围：`design.md`、候选 provenance]
- [x] 3.2 复核 candidate 仍未进入 `suites/`、active suite、formal experiment plan 或 `results/records/`，并在同一 PR 中保留验证证据和未执行的正式运行原因。[写入范围：PR body、OpenSpec task evidence]
