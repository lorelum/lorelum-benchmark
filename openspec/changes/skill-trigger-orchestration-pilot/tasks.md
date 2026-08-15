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
- [x] 保持 runner prompt、模型、预算与工具门禁不变；更新 snapshot、运行资格校验和三条件各三次 scratch 诊断。 [写入范围：v2 private、scratch/]

## 11. v2 政策缺口驱动发现修订

- [x] 在 Issue #96 与 OpenSpec 记录 r8 的无查询/区分度不足结论，并确认 r9 只测“政策缺口下的上下文驱动自主发现”，不创建 v3。 [写入范围：Issue #96、OpenSpec]
- [x] 将处理组目录工具改为通用的“未解析政策引用”能力发现接口；发现调用也必须以已读公开输入锚定，不得透露本题答案或要求调用。 [写入范围：v2 private execution]
- [x] 将公开题面与 starter 改为不泄露语义的项目政策编号，以及范围切换与同范围重载并发的项目加载场景；不出现 Lorelum、Skill、Practice、目录、查询或实现词。 [写入范围：v2 public]
- [x] 新建版本化的异步操作归属 Practice 与等长无关对照元数据；保留 r8 使用的 Practice 源码作为历史材料，不原地改写。 [写入范围：v2 private practices]
- [x] 将 AST/runtime evaluator 与 reference/equivalent/anti-pattern calibration 改为覆盖跨范围、同范围重载以及旧操作 resolve/reject 的结果归属。 [写入范围：v2 private evaluator、calibration]
- [x] 在 runner 增加三次触发校准与“未通过则停止”门，并在 summary 中单列发现门结果。 [写入范围：v2 private execution]
- [x] 重生成 snapshot，运行 validate、contracts、v2 定向测试、strict OpenSpec、calibration 和泄露审计。 [写入范围：v2 private、scratch/]
- [x] 在上述离线门禁全部通过后，运行三次 `lorelum-retrieval` 触发校准；三次均有效但均未形成完整查询链路，故按门禁阻止三条件 scratch quality pilot，并报告 `diagnostic-only`。 [写入范围：scratch/]

## 12. v2 来源权威政策缺口修订

- [x] 在 Issue #96 与 OpenSpec 记录 r9 的有效负结果，并明确强制工具 canary 只验证可达性、不构成自主发现证据。 [写入范围：Issue #96、OpenSpec]
- [x] 将公开场景扩展为前台导航、手动重载与后台协调的来源权威冲突；`PX-47` 只说明外部政策缺口，不提供规则或实现。 [写入范围：v2 public]
- [x] 将处理组工具文案收敛为“解析已读公开文件中的项目政策引用”的可选能力，保留真实三段链路、公开锚点与私有约束隔离。 [写入范围：v2 private execution]
- [x] 将 private Practice、AST/runtime evaluator 与 reference/equivalent/anti-pattern calibration 扩展到前台 supersession 和后台 late-settlement 的 success/reject 六路径。 [写入范围：v2 private evaluator、calibration]
- [x] 新增独立 scratch canary：显式调用真实 Pi 工具链，只报告可达性、不运行候选评测或写入效果统计。 [写入范围：v2 private execution、scratch/]
- [x] 修复 opaque 政策标识锚定和 qualification extension 接线，重生成 snapshot，并以 extension/runner 隔离测试确认；真实 canary 完成完整、锚定且无泄露的链路。 [写入范围：v2 private、scratch/]
- [x] 在相同模型与无工具调用要求的 runner prompt 下运行三次 r10 发现门；三次均有效但均未查询，按门禁阻止九次 quality pilot，并记录为 `diagnostic-only`。 [写入范围：scratch/]
- [x] 运行 r10 最终 `validate`、contracts、定向测试、strict OpenSpec、calibration、泄露审计与 diff 检查。 [写入范围：v2 private、scratch/]
- [x] per-attempt 记录与 evaluator 输出对齐 outcome/v1 词汇（health/semantic/quality），保留 discovery gate 等过程字段，判定逻辑不变。 [写入范围：v2 private evaluator、execution]

## 13. r11 不可绕过信息缺口修订

- [x] 诊断 r10 工具可见性：无提示会话中 `skills_list`/`skills_load` 对模型可见（共 8 个工具），排除 harness 暴露问题；确认失败源于题面动机不足。 [写入范围：scratch/]
- [x] 新增公开回归用例“后台协调不得覆盖前台手动重载的结果”，使仅按操作开始时间守卫的实现失败；reference 6/6 通过，naive 与 anti-pattern 在该用例失败（临时 Playwright 工作区验证）。 [写入范围：v2 public]
- [x] 公开 task.md 显式引用 `docs/project-policies/PX-47.md`（工作区不含该文件），形成读取 `ENOENT` 的真实信息缺口。 [写入范围：v2 public]
- [x] 重建 snapshot 并运行 validate、定向测试、strict OpenSpec、泄露审计。 [写入范围：v2 private、scratch/]
- [x] 运行三次 r11 发现门：三次均有效但均未查询；agent 从公开回归断言推导出正确来源权威规则，未读取政策文档，质量 pilot 被阻止，记录为 `diagnostic-only`。 [写入范围：scratch/]

## 14. r12 验收分层修订（规划）

- [x] 在 Issue #96 与 OpenSpec 记录 r12 规划：公开测试仅验证回归，私有 judge 依据未公开 PX-47 规则判定政策符合性；task.md 如实声明验收方式但不要求调用工具。 [写入范围：Issue #96、OpenSpec]
- [x] 新建 skill-trigger 专属 judge provider 与私有 rubric（编码来源权威规则），注册到 judge providers；rubric/评分逻辑不得进入 agent 工作区或公开题面。 [写入范围：src/benchmark/judge/、v2 private]
- [x] 先做 judge 校准：reference 判为符合、anti-pattern（最新请求守卫）判为不符合，记录校准矩阵；未通过校准前不进入模型运行。校准矩阵（deepseek-v4-pro）：reference 100/100，anti-pattern 30/100，gap 70 ≥ 45，calibration_pass=true。 [写入范围：src/benchmark/judge/、v2 private]
- [x] 更新公开 task.md 验收声明，保持不泄露规则、不出现 Lorelum/Skill/Practice/查询等词。 [写入范围：v2 public]
- [x] run-local 在质量 pilot 阶段调用 judge provider，记录 judge sidecar 与 redacted 输出；处理组 success 收紧为查询链路 + 公开测试 + judge 符合。 [写入范围：v2 private execution]
- [x] 运行离线校验与 r12 发现门（三次）：三次均有效但均未查询，agent 从公开材料推断出正确来源权威规则且引用 PX-47，质量 pilot 被阻止，记录为 `diagnostic-only`。 [写入范围：v2 private、scratch/]

## 15. 证据链收敛

- [x] 收敛 r9–r12 证据链：12 次有效 attempt 中查询链路 0/12，结论为「可推断场景下无自主查询」；暂停 async-cleanup-v2 题面迭代，冻结证据链，不创建正式 record、不升级 suites。 [写入范围：OpenSpec]
- [x] 落地重审计划：四方向按信息价值与成本排序（模型差异先行诊断、规则不可推断性为关键路径、任务类型、检索入口语义），结论须先规划后实施。 [写入范围：Issue #96、OpenSpec]
- [x] 运行模型差异诊断探针（deepseek-v4-flash）：早期两次“卡死”系超时不足；延长超时后完整任务正常完成（约 4–4.5 分钟、12 次公开读取、无查询、正确实现），与 pro 行为一致，支持“无自主查询是场景共性”结论。 [写入范围：scratch/]

## 16. r13 规则不可推断场景（规划）

- [x] 起草并确认 r13 规划：公开测试只断言现象、PX-47 规则仅由 judge 判定、处理组 success 需真实查询链路；确认领域（复用）、规则形态（窗口阈值型）、baseline 区分度（naive 公开测试失败）。 [写入范围：Issue #96、OpenSpec]
- [x] 设计窗口阈值规则并校准 judge v2：reference/equi 100 分（符合）、anti-pattern（后台永不覆盖）63 分（不符合）、naive 公开测试失败；现象级测试下 reference/equi/anti 均通过。校准阈值 reference_min 90 / anti_pattern_max 75 / gap 15。 [写入范围：src/benchmark/judge/、v3 private]
- [x] 新建 async-cleanup-v3 revision：现象级公开测试、窗口规则 Practice 卡、judge v2、简化 evaluator 与 calibration；v2 证据冻结。 [写入范围：v2 private、v3]
- [x] 运行 r13 发现门（三次）：三次均有效但均未查询；agent 实现来源权威类变体但无窗口规则，质量 pilot 被阻止，记录为 `diagnostic-only`；不查询在规则不可推断下依然稳定。 [写入范围：v3、scratch/]

## 17. r14 反馈循环（async-cleanup-v4）

- [x] 新建 async-cleanup-v4：协调数据可见化、现象级双断言（协调生效/前台保持）、失败信息指向政策文档；v3 冻结。 [写入范围：v4 public/private]
- [x] 校准矩阵验证：naive 2 失败（地板）、reference/equiv 7/7 通过 + judge 100、anti-pattern（approximate）7/7 通过但 judge 30 分不符合（陷阱）、never-apply 协调生效断言失败。 [写入范围：v4 private、scratch/]
- [x] 离线校验：validate、contracts、v4 定向、strict OpenSpec、泄露审计、diff check；v4 snapshot 重建。 [写入范围：v4、scratch/]
- [x] 运行 r14 发现门（三次）：attempt-2 主动调用 skills_list 两次（被锚点拒绝）后自行推断 500ms 规则并正确实现；attempt-1/3 未查询；发现门 fail，结果 diagnostic-only。首次出现自主查询意图，疑为 harness 锚点误拒，需诊断修复后重跑。 [写入范围：v4、scratch/]
- [x] 修复锚点误拒（task.md 初始注入作为公开输入）并加隔离测试；r14b 三次均未查询（2 次超时、1 次正常），查询意图未稳定复现；发现门仍 fail。 [写入范围：v4、scratch/]
- [x] r14c：attempt-2 完成首个完整自主查询链路（trace.complete=true），attempt-1/3 未查询；发现门仍 fail（3/3 协议）；实现为近似（约束未完整采纳）。 [写入范围：v4、scratch/]
- [x] r14d：三次均无完整链路；attempt-1 篡改公开测试与 services（作弊路径）；已新增 tests 篡改判无效门及隔离测试。 [写入范围：v4、scratch/]
- [x] r14 四轮 12 次汇总：查询意图 2/12、完整链路 1/12（r14c attempt-2）；「反馈循环 + 锚点修复」使自主查询可复现但低频。 [写入范围：v4、scratch/]
- [x] r14e：三次均无查询、无篡改；五轮 15 次汇总：查询意图 2/15、完整链路 1/15；结论为方向性弱正信号。 [写入范围：v4、scratch/]
- [x] r14f：新增「前台后 200ms 内协调不得改变结果」现象级断言（抓无条件生效近似）；校准矩阵更新（naive 3 失败、anti-pattern 猜 300ms 过测试但 judge 不符合）；judge 校准通过。 [写入范围：v4、scratch/]
- [x] r15：三次均无查询；attempt-1 从测试时序点插值猜中 500ms 窗口并正确实现但未查询；「窗口内不生效」断言未提升触发率（agent 猜值闭合）。累计 18 次：查询意图 2/18、完整链路 1/18。 [写入范围：v4、scratch/]
