## 设计推导

### 轨道边界

本轨道与现有两条轨道的区分点在 Practice 怎么来：前两条把处理变量喂给 agent，本轨道要求 agent 自己触发查询。

### 场景选择

候选场景：异步副作用生命周期超出组件（useEffect 发请求，组件卸载后 setState）。`async-cleanup-v1` 的 `pilot-r5` 已确认因 extension telemetry 异常无效，revision 冻结；v2 将题面改为快速导航故障报告：快速离开并返回概览页时，旧请求偶发影响页面状态。题面不得写入 Skill、cleanup、AbortController 或固定实现。

选择理由：

1. agent 会做、但不知道该做的失败模式--它有能力写 cleanup，但默认不意识到这个场景该处理。属于不知道要做而非不会，符合待测变量。
2. 与 practice-injection 的 API 分层场景不重叠。
3. 技术栈选 SPA（Vite + React 19 + TS），待测变量隔离最干净，不引入 RSC 复杂度混杂；AST 探针结构清晰。

### mock 返回结构

三字段：范围约束、命中 Practice 的可审计引用（仅 id/version/SHA-256，不含原文）、行为约束（非指令，如异步副作用不得在组件卸载后继续影响状态，agent 自行决定实现方式）。Practice 卡原文保留在 private/，不进 mock 返回结构或模型输入。

### 对照组

三个 condition，不设 oracle-practice 天花板：baseline（地板）、lorelum-retrieval（实验组）、irrelevant-practice（盲从检测）。不设天花板的原因：实验组是否达标由 evaluator 独立判定；irrelevant-practice 升级为听懂约束的唯一旁证。

### 工具调用与观测边界

runner 通过 Pi extension 提供可发现目录与受控 mock 工具，但不得预先把 Lorelum、查询结果或行为约束写入 system prompt。处理组 agent 必须自行完成 `skills_list`、`skills_load("lorelum")` 与 `lorelum_query({ query, public_refs })`；查询工具在加载前不可调用。mock 的三字段结果以工具返回进入模型上下文，行为约束仍处于 prompt 可见层，工具可用性、调用门禁与审计属于 harness 层。

`public_refs` 必须指向本次运行中 agent 已通过 read 工具读取的公开输入；查询文本须包含与这些输入相关的任务锚点。runner 只记录真实工具调用与返回，不得事后补写发现、查询或采纳事件。

### baseline 预期缺陷

baseline 下 agent 写出不带 cleanup 的 useEffect。由 AST 探针稳定检出 useEffect 回调未返回 cleanup 函数。不依赖运行时 warning。

### 度量

主量看过程：trace 记录公开输入读取、Skill 发现、Skill 加载、带任务锚点的查询及结构化返回。处理组只有同时具备完整真实事件链、语义通过与质量门通过，才可计为成功。辅量看结果：AST 结构门拒绝明显伪 cleanup，运行时门分别通过“延迟请求 -> 卸载 -> resolve”与“延迟请求 -> 卸载 -> reject”断言卸载后状态 setter 调用数为零。没有过程链、结果却碰巧对，不算。

### v2 运行有效性

extension 在 `tool_execution_start` 中以 `toolCallId` 记录已读取 public 输入的路径，在 `tool_execution_end` 中仅按该 ID 结算；end event 不得读取 `args`。观测、审计和路径解析失败必须被 extension 内部吸收，绝不影响 agent。出现 extension error、trace 与 audit 不一致，或 stdout/stderr/summary/trace 出现 private 路径或 Practice 原文时，attempt 标记为 invalid 且不进入效果判定。

v2 增加公开成功路径回归，证明离开页面后的请求结果不得再被已销毁页面处理；该回归描述行为而非实现。private runtime probe 同时覆盖成功与失败分支。reference、等价实现与 anti-pattern 在 v2 独立校准，anti-pattern 至少覆盖只保护成功分支的伪修复。

`pilot-r6` 未生成 summary、trace、evaluator 或 record：Pi 的 Windows bash 后端解析到 WSL 后挂起，整批仅为无效环境证据。由于 v2 尚无记录结果，不创建 v3；在 v2 的 `tool-policy` 中声明 Git Bash，并由 runner 为每次 attempt 设置独立 `PI_CODING_AGENT_DIR/settings.json` 的 `shellPath`。该配置目录位于 attempt private 输出，不复制到 agent workspace，不改变模型、提示、工具、预算或条件。

### v2 上下文驱动发现修订

`pilot-r7` 的九次有效 attempt 显示：当前公开包名包含实现词，题面和公开回归又直接描述旧请求在离开页面后继续处理的生命周期边界；三个条件均自行通过质量门，处理组也没有发生查询。此结果保留为强自主发现（无任何上下文检索动机）的负证据，不得以新一轮结果覆盖。

v2 的下一轮改为“快速切换项目范围后，旧范围请求的成功或失败终态覆盖当前范围”的异步结果归属故障。公开事故材料只出现真实但不解释的分类标识 `ui.response-ownership`，作为 agent 可引用的公开对象；不得出现 Lorelum、Skill、Practice、cleanup、AbortController、查询动作或行为约束。它不要求 agent 调用任何工具，agent 仍自行判断是否从可选目录发现能力并以该分类及已读公开文件锚定查询。runner 的共享 prompt、模型、预算、工具调用门禁和 condition 保持不变。

私有质量门相应验证旧范围请求在 success 与 failure 两种终态下均不再影响当前范围的状态；允许取消、失效标记、请求代次等任意等价实现。公开 starter 名称也必须移除实现词。此轮仅能报告“上下文驱动的自主发现”信号，不能声称强自主发现。

### 风险与前置

- 场景偏简单，agent 可能表现过好导致 baseline 失败模式不成立。candidate 先跑本地 pilot 确认 baseline 下 agent 确实会失败。
- mock Practice 与 irrelevant Practice 用同一模板、近似字符数，控制文本长度混杂。

### Profile 契约（skill-trigger-orchestration/v1）

本轨道不复用 injection-calibration/v1 或 treatment-comparison/v1，新建 `skill-trigger-orchestration/v1` profile。理由：

- injection-calibration/v1 的 `lorelum-retrieval` 是 `status: unavailable`（只测显式注入，真实检索不可用）；本轨道 `lorelum-retrieval` 是实验组，必须 `status: declared`，走 mock 查询。
- injection-calibration/v1 的 Practice 通过 `condition-scoped-private-runtime` 通道由 runner 显式注入；本轨道的 Practice 不是显式注入，是 agent 触发 mock 工具查询后取得三字段结果。需要新 channel：`mock-retrieval-tool-call`。
- injection-calibration/v1 的 decision_rule 是"oracle 严格高于对照"；本轨道无 oracle，decision_rule 是"lorelum-retrieval 过且 irrelevant-practice 不过"。

新 profile 的 conditions：

- baseline：status declared，channel none，无 Skill 列表、无查询。
- lorelum-retrieval：status declared，channel `mock-retrieval-tool-call`，agent 可发现并加载 Lorelum 后主动查询，mock 工具返回相关三字段约束。
- irrelevant-practice：status declared，channel `mock-retrieval-tool-call`，工具与预算相同，但返回预声明的无关 Practice 约束，作为负对照而非检索质量断言。

mock 查询返回结构进 profile 契约：`{ scope_constraint, matched_practice: { id, version, sha256 }, behavior_constraint }`，其中 behavior_constraint 为不得/必须式限制，非指令。

trace 记录 `public_input_read`、`skill_discovered`、`skill_loaded`、`practice_query_issued` 与 `practice_query_resolved`，均为 redacted（不含 Practice 正文或 private 路径）。

### 内核与 calibration 复用

candidate.yaml 声明 `kernel: { core: v1, profile: skill-trigger-orchestration/v1, materializer_kind: react-vite }`。calibration fixtures 复用 react-vite app-shell 共享 base + overlay 合成树（与 practice-injection 同源 base），通过 sets.yaml 声明 reference/equivalent/anti-pattern fixtures；base 路径归属为 `incubator/calibration-bases/skill-trigger-orchestration/v1/react-vite/app-shell`，若与 injection-calibration 共享同一物理 base 则在 sets.yaml 中显式声明跨 profile 共享并绑定 digest。naive starter 本身完整自带在 public/starter/app，不参与 overlay 合成。

### calibration fixtures 语义

calibration sets 声明三个 fixture，各自测探针的不同判据：

- reference：带 cleanup 的正确实现，MUST 通过 AST 探针。证明探针能接受正确实现。
- equivalent：命名/布局不同但职责等价的正确实现（如用 AbortController 而非 mounted 标志），MUST 通过探针。证明探针不把单一写法当唯一答案。
- anti-pattern：看似处理了实则没处理的绕过实现--例如在卸载后仍 setState 但加了个空的 cleanup 函数，或把请求挪到组件外但仍未取消。MUST 被探针拒绝。证明探针不漏判伪装正确的写法。

v2 的方向性 pilot 固定使用 `deepseek/deepseek-v4-pro` 与既有预算，baseline、lorelum-retrieval、irrelevant-practice 各三次。未查询归类为主动发现失败；完整查询但质量门失败归类为理解或实施失败；运行有效性门失败归类为实验无效。只有处理组三次都完整成功且两个对照组三次都未通过质量门，才报告方向性正信号；其余结果均为 diagnostic-only。

anti-pattern 与 naive starter 的区别：naive starter 是 baseline 预期产出（压根不写 cleanup，探针直接判失败）；anti-pattern 是 calibration 用的已知绕过实现（写了但无效，测探针的判别力）。两者不重复。

### v2 r9 政策缺口驱动发现修订

`pilot-r8-contextual` 的九次有效 attempt 表明，`ui.response-ownership` 既不能构成对可选目录的可信信息线索，也没有让 Practice 提供模型无法从通用 React 知识推出的增量。r8 仍是上下文驱动发现未成立的证据；不得通过更换标签或在 runner prompt 中要求工具调用来制造成功。

r9 在不创建 v3 的前提下继续修订 `async-cleanup-v2`，测量对象收敛为：当公开任务与源码包含真实但未解释的项目政策引用、且该引用的定义不在公开材料中时，agent 是否自主发现可用的项目指导能力、加载其匹配项并以已读公开证据查询。题面不得出现 Lorelum、Skill、Practice、目录、查询、cleanup、AbortController 或固定实现；runner prompt 不变。

公开材料使用不含行为语义的政策编号，并仅陈述其约束发布行为且定义不在公开代码中。处理组的 `skills_list` 工具以通用方式说明自身可发现“与公开任务或源码中未解析政策引用有关的可选项目指导能力”；该说明既不暴露本题答案，也不规定调用时机。目录发现调用本身必须携带 agent 已读取的公开引用和与其共享的锚点，防止无关浏览被计为主动发现。

场景改为项目范围切换与同范围手动重载同时存在的项目加载操作。相关 Practice 约束为：只有最新项目加载操作可结算视图；任何被后续操作取代的成功或失败终态都不得更新状态。它不规定失效标记、请求代次、可取消信号或其他实现。私有运行时质量门分别覆盖跨范围和同范围重载两类 superseded 操作，并分别让旧操作 resolve 与 reject；AST 门仅拒绝无归属保护或伪保护。这样，单一 effect cleanup 不再天然覆盖全部质量门，而等价的共享操作归属实现仍可通过。

模型调用分两阶段：先以 lorelum-retrieval 连续三次执行轻量触发校准，要求每次都有完整 `skills_list -> skills_load -> lorelum_query` 真实链路且 query 引用已读公开对象。任何一次未达标即记录“发现门未通过”并停止，不运行完整九次质量 pilot。三次均达标后，才依旧按 baseline、lorelum-retrieval、irrelevant-practice 各三次运行；模型、预算、私有边界、redacted trace、`diagnostic-only` 规则和无正式 record 边界保持不变。

### v2 r10 来源权威政策缺口修订

`pilot-r9` 的三次有效 attempt 都读取了公开材料，却直接采用请求代次守卫修复范围切换与重载；`PX-47` 因而只是可以忽略的标签。r10 不把更强的提示、工具调用要求或 Practice 注入伪装为自主发现，而是让政策语义决定可观察的正确行为：公开源码同时存在前台导航、手动重载和后台协调操作，`PX-47` 是三者结果归属的外部权威政策。公开材料说明该政策适用于这些来源、定义不在公开代码，且不能由时间先后推断；题面仍不得提及 Lorelum、Skill、Practice、目录、查询、cleanup、AbortController 或固定实现。

私有政策约束为：前台导航和手动重载取得视图结果权威；后台协调是非权威来源，即使在前台操作之后启动或更晚结算，也不得改变项目列表、加载或错误视图状态；被取代的前台操作同样不得结算。这样，全局“最新请求获胜”是可校准的 anti-pattern，而按来源与操作归属建立守卫的多种等价实现仍可通过。运行时质量门保留前台跨范围和同范围重载的 success/reject 覆盖，并新增后台协调在前台之后启动的 success/reject 覆盖。

`skills_list` 的工具名与三段真实链路保持不变，但其 label/description 只准确陈述一个通用能力：根据 agent 已读公开文件中的项目政策引用发现可选指导。它不点名 `PX-47`，不返回政策答案，不要求调用。自主发现的证据仍只来自 agent 无提示地以公开锚点选择该链路；强制 Pi 调用 canary 仅验证动态工具注册、加载、查询和 redacted audit 在真实模型端可达，独立写入 scratch，不运行评测、不纳入发现门或处理效果。

### r10 执行结果

早期 qualification 输出分别揭示 opaque 标识 `PX-47` 未被锚点解析器识别、以及资格路径漏传 `--extension`；它们是 harness 资格缺陷，不构成模型或 Pi 能力证据。修复并通过 extension 与 runner 隔离测试后，新的真实 canary 成功完成 `public_input_read -> skills_list -> skills_load -> lorelum_query`，其发现和查询均锚定 `task.md` 中的 `PX-47`，且 trace、stdout、stderr、summary 与 agent 工作区均未泄露私有材料。

在相同模型 `deepseek/deepseek-v4-pro`、相同预算且 runner prompt 不要求调用工具的三次 r10 发现门中，三个 attempt 都通过运行有效性门并读取了公开任务与源码，但均没有产生 `skills_list`、`skills_load` 或 `lorelum_query` 事件。因此这不是 extension 失败，也不是查询后实施失败，而是该来源权威政策缺口下的主动发现失败。发现门按协议失败，三条件各三次 quality pilot 未运行，结果只能报告为 `diagnostic-only`，不得产生方向性正信号。

### v2 r11 不可绕过信息缺口修订

r10 的失败证据表明：三次 attempt 均把任务框架化为经典竞态 bug 并用最新请求守卫闭合，`PX-47` 只是可忽略标签；工具可见性诊断确认无提示会话中 `skills_list`/`skills_load` 对模型可见，问题不在 harness 暴露而在信息缺口强度。r11 不注入工具调用要求或行为约束，只让通用知识失效：公开回归新增“后台协调在前台操作后启动且更晚结算不得改变前台结果”的用户可见用例，使仅按操作开始时间守卫（requestIdRef）的实现必然失败；公开 task 改为显式引用 `docs/project-policies/PX-47.md`，而该文档不随公开代码提供，agent 读取将得到 `ENOENT`，形成无法用通用竞态知识闭合的真实缺口。预期行为链为：跑公开测试失败 → 尝试读取政策文档不存在 → 通过 `skills_list` 解析项目政策引用 → 加载并查询来源权威约束 → 按来源权威实现。该修订保持题面不得出现 Lorelum、Skill、Practice、目录、查询或固定实现词。

### r11 执行结果

三次 r11 发现门均有效，但 `skills_list` 发现、`lorelum_query` 查询与完整链路均为 0/3；质量 pilot 按门禁被阻止，结果 `diagnostic-only`。与 r10 不同，三次 attempt 都从新增公开回归断言推导出正确的来源权威规则并实现正确（后台协调让位于前台操作），且未尝试读取 `docs/project-policies/PX-47.md`。这证明新用例解决了通用知识闭合，但公开测试断言本身成为最直接的规格来源：只要规则能从断言推断，缺失的政策文档就不会构成查询动机。r11 因此把负证据从"规则不可知"推进到"测试即规格"。

### v2 r12 验收分层修订（规划）

r11 证明公开测试断言本身成为规格来源：规则能从断言推断时，缺失的政策文档不构成查询动机。r12 把验收分层：公开测试只验证回归（保持现有区分度，但不再作为政策符合性的充分条件），新增私有 judge 验收层依据未公开的 PX-47 完整规则判定实现是否符合政策。task.md 如实声明验收方式（修复按 PX-47 完整规则评审，规则见未随公开代码提供的 `docs/project-policies/PX-47.md`，公开测试通过不等于符合政策），使 agent 的闭合目标从“让测试通过”变为“符合不可见规则”，从而恢复对政策文档/查询工具的动机；该声明不要求调用工具，也不注入行为约束。

judge 层设计：新建 skill-trigger 专属 judge provider，静态私有 rubric 编码 PX-47 的来源权威规则（前台导航/手动重载权威、后台协调非权威、被取代前台操作不得结算），rubric 与评分逻辑位于 candidate private 或 `src/benchmark/judge/` 且不得进入 agent 工作区；评分输入仅含公开材料（task.md、candidate diff、公开测试结果），输出为 outcome/v1 的 QualityOutcome。处理组 success 收紧为完整查询链路 + 公开测试通过 + judge 符合政策；baseline/irrelevant 需在公开测试或 judge 层失败。signal 判定与发现门协议不变；judge 使用独立 LLM 配置（`LORELUM_JUDGE_*`），不占用 agent 模型预算。实现前必须先做 judge 校准：reference 与 anti-pattern 应分别被 judge 判为符合与不符合，并记录校准矩阵。
