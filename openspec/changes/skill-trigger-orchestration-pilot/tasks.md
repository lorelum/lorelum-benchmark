## 1. Profile 契约（skill-trigger-orchestration/v1）

- [x] `src/benchmark/kernel/profiles/skill-trigger-orchestration/v1/types.ts`：定义 conditions（baseline/lorelum-retrieval/irrelevant-practice，lorelum-retrieval 为 declared）、channel（mock-retrieval-tool-call）、mock 返回三字段结构、真实工具事件类型、decision_rule。
- [x] `src/benchmark/kernel/profiles/skill-trigger-orchestration/v1/runtime.ts`：解析 candidate 的 conditions.yaml、mock 查询声明、Practice 卡哈希；redacted trace。
- [x] `profiles/index.ts` 注册导出新 profile。
- [x] runtime 测试：覆盖 declared lorelum-retrieval、redacted trace、malformed 拒绝。

## 2. 候选工作区骨架

- [x] `incubator/skill-trigger-orchestration/async-cleanup-v1/` 目录，含 public 与 private。
- [x] candidate.yaml：kernel 声明（core v1 / profile skill-trigger-orchestration/v1 / materializer react-vite）、calibration_sets、calibration_roles。
- [x] public/task.md：只描述可观察行为，不提示异步清理或 Practice。
- [x] public/starter/app/：完整自带的 naive starter（Vite + React 19 + TS），useEffect 发请求不带 cleanup；不通过 overlay 表达该缺陷，避免改 overlay 即改 baseline 预期。calibration 的 base + overlay 仅用于 reference/equivalent/anti-pattern fixtures。
- [x] private/snapshot.json。

## 3. mock 查询与 Practice 卡

- [x] private/practices/oracle.async-lifecycle.v1.md：异步生命周期 Practice（行为约束形式）。
- [x] private/practices/irrelevant.<topic>.v1.md：无关 Practice（同模板、近似长度）。
- [x] private/practices/metadata.yaml：长度与独立评审记录。
- [x] mock 查询返回三字段结构的实现，绑定 Practice id/version/sha256。

## 4. evaluator

- [x] private/evaluator/verify-cleanup.ts：AST 探针查 useEffect 回调是否返回 cleanup。
- [x] private/evaluator/evaluate.ts：组合语义检查与 AST 探针。
- [x] private/oracle.yaml：语义门 + 质量探针声明。
- [x] calibration/sets.yaml + overlays：reference（带 cleanup，通过探针）、equivalent（等价正确写法，通过探针）、anti-pattern（伪装正确实则无效，如空 cleanup，被探针拒绝）。profile 专属 shared base 与 kernel calibration role 已验证通过。

## 5. 对照与执行治理

- [x] private/conditions.yaml：baseline / lorelum-retrieval / irrelevant-practice 三条件，固定模型/预算/工作区；lorelum-retrieval 为 declared。
- [x] private/execution/tool-policy.yaml：public-only 工作区，私有材料不进模型输入。
- [x] 本地执行器：三条件各两次，trace 记录三层事件，结果写 scratch/。

## 6. pilot 验证

- [x] 跑 baseline pilot，确认 agent 确实写出不带 cleanup 的 useEffect。
- [x] 跑 lorelum-retrieval pilot，确认 mock 链路可触发、约束可注入、trace 三层事件齐全。
- [x] 跑 irrelevant-practice pilot，确认无关约束不致盲从通过。

## 7. 验收

- [x] `bun run validate` 与 `bun run test:contracts` 通过。
- [x] `npx openspec validate skill-trigger-orchestration-pilot --strict` 通过。
- [x] trace 记录三层事件。
- [x] lorelum-retrieval 过 evaluator 且 irrelevant-practice 不过。

## 8. 审查门禁修复

- [x] 将 prompt 预注入替换为 agent 真实调用的 Skill 发现、加载与 mock 查询 extension，并记录只含公开锚点与哈希的 trace。
- [x] 将 AST 探针定位为结构门，增加“延迟请求 -> 卸载 -> resolve”后状态 setter 不得调用的运行时质量门。
- [x] 将 signal 收紧为处理组每次 dual pass 且两个对照每次质量门失败；缺少真实过程链一律不得计入。
- [x] 重生成 snapshot、重跑 calibration 与 3 条件 x 2 次诊断；结果为 no-obvious-signal，处理组未形成真实查询链路。

## 9. v2 有效性与任务修订

- [x] 在 Issue #96、proposal 与 design 中冻结 `async-cleanup-v1` 的 `pilot-r5` 为 extension telemetry 异常导致的无效证据；不得再修改 v1。 [写入范围：Issue #96、OpenSpec]
- [x] 创建 `async-cleanup-v2` 的正式 public/private 源码、v2 snapshot 与独立 calibration materials。 [写入范围：`incubator/skill-trigger-orchestration/async-cleanup-v2/`]
- [x] 修复 v2 extension 的 read 事件关联：start 记录路径、end 仅按 toolCallId 结算，所有 telemetry 错误不影响 agent。 [写入范围：v2 private execution]
- [x] 为 v2 runner 增加 extension error、trace/audit 一致性及 private 泄露运行有效性门，并在 summary 分离有效性、发现、锚定、采纳、语义、AST、resolve 与 reject 质量门。 [写入范围：v2 private execution]
- [x] 增加 extension 隔离测试：无 end.args 不抛错、显式链路完整 redacted、未调用 Skill 不产生伪事件、返回不含私有材料。 [写入范围：v2 private execution]
- [x] 将公开题面和公开回归改为快速导航故障报告；私有 probe 分别覆盖卸载后 resolve 和 reject。 [写入范围：v2 public、private evaluator]
- [x] 建立 v2 reference、等价实现与只保护成功分支/空 cleanup anti-pattern 校准，并验证判别力。 [写入范围：v2 private calibration]
- [x] 在 v2 tool-policy 声明隔离 Git Bash 环境，runner 为每个 attempt 设置 private `PI_CODING_AGENT_DIR`，并以真实 Pi bash 调用验证其不经 WSL。 [写入范围：v2 private execution]
- [x] 运行 validate、contracts、v2 定向测试、strict OpenSpec、calibration 与泄露审计；全部通过后运行三条件各三次的 scratch 诊断。 [写入范围：scratch/ only]

## 10. v2 上下文驱动发现修订

- [x] 在 Issue #96 与 OpenSpec 记录 r7 对强自主发现的负结论，以及下一轮只测上下文驱动发现的边界。 [写入范围：Issue #96、OpenSpec]
- [x] 以快速项目范围切换重写 v2 public task、starter 与公开回归；移除所有实现词泄露，并添加不解释的 `ui.response-ownership` 事故分类。 [写入范围：v2 public]
- [x] 将私有 Oracle、AST/runtime probes 与 calibration fixtures 改为验证旧范围 success/reject 均不影响当前范围状态。 [写入范围：v2 private]
- [ ] 保持 runner prompt、模型、预算与工具门禁不变；更新 snapshot、运行资格校验和三条件各三次 scratch 诊断。 [写入范围：v2 private、scratch/]
