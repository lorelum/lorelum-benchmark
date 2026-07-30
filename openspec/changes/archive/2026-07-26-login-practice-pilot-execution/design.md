## Context

Issue #75 承接 #73 的登录页 Practice candidate 与 #77 的校准修复。公开 starter 已通过浏览器语义校准，但会失败私有 AST 分层探针；私有 reference 同时通过两者。因此，本地对照的唯一结果是每次尝试是否“双通过”。

本 change 先实现可运行的执行路径和 dry-run；本机 Pi 与模型访问可用后，按已固定的三条件和重复次数执行本地候选诊断。

## Decisions

### 1. 三条件、每组两次

执行 baseline、Oracle Practice、无关 Practice 各两次。三组使用相同 public starter、模型标识、Pi 命令、任务提示、工具列表和十分钟时限；唯一预期差异是 Oracle 或无关 Practice 的运行时注入。`lorelum-retrieval` 继续保持 unavailable。

本 candidate 测量的是可迁移 Practice 的运行时注入，不把 reference 的文件路径、导出、内部 helper 或命名当作题目补充。Oracle Practice 以适用场景、分层建议和 anti-pattern 传达组件与 API 边界、DTO 映射及错误翻译；私有 probe 只检查这些可替代实现仍可满足的边界归属。公开浏览器语义是任务完成的硬门槛，分层 probe 是用于比较 Practice 相关质量的独立信号。

两次重复仅用于快速观察，不能用于显著性或泛化结论。Oracle 的双通过次数严格高于 baseline 和无关对照时，结果记为“有信号”；其余情况记为“无明显信号”。

### 2. Candidate 私有本地执行器

执行器位于 `private/execution/run-local.ts`，不改动共享 Pi runner。它为每次尝试在 `scratch/` 创建干净目录，只复制 `public/task.md` 与 `public/starter/`。Pi 以非交互、无 session、无项目 context、无自动 skill 的模式运行；Practice 文本仅作为对应条件的追加系统提示传递，绝不写入工作区。

执行完成后，执行器才在私有目录运行现有 evaluator，并保存 Pi 输出、evaluator 输出、diff 和 `summary.json`。所有结果留在被忽略的 `scratch/`，不会生成 record、artifact index 或外部存储对象。

### 3. 可复跑输入与失败处理

`conditions.yaml` 固定本轮的模型标识、Pi 版本、预算、Practice hash 和默认两次重复；candidate snapshot 固定执行器与条件文件。`--dry-run` 检查 snapshot、conditions 和计划的工作区边界，不调用 Pi 或模型。实际运行会在无法启动 Pi、Pi 退出失败或 evaluator 失败时记录该次失败并继续其余尝试。

本地比较不要求不可变模型快照、盲评、Object Lock、成本统计或受保护身份管理。这些要求不影响当前“是否看到方向性信号”的判断。

## Risks

- 本机 Pi 或模型凭据缺失：dry-run 仍可通过，实际运行明确失败，待本机配置后复跑。
- 两次重复可能偶然波动：只报告原始次数，不作普遍有效性结论。
- 本地工作区不等同正式 sandbox：执行器只 materialize public 输入，结果不得作为正式 benchmark 证据。

## Migration Plan

1. 将已确认的轻量设计写回 #75 与本 change。
2. 实现执行器、测试 dry-run 与工作区边界，更新 candidate snapshot。
3. 配置本机 Pi 后运行 `bun run practice:login-local`；依据 `scratch/` 中 summary 查看信号。
4. 只有出现信号时，才通过飞书后续任务扩大候选任务和重复次数。
