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

### r12 执行结果

judge 校准通过（deepseek-v4-pro）：reference 100/100，anti-pattern 30/100，gap 70 ≥ 45。三次 r12 发现门均有效，但 skills_list 发现、lorelum_query 查询与完整链路均为 0/3，质量 pilot 被阻止，结果 diagnostic-only。三次 attempt 都正确实现来源权威规则（与 reference 等价），且明确引用 policy PX-47，但没有一次尝试读取 docs/project-policies/PX-47.md 或调用查询工具。即使 task.md 声明“测试通过不代表符合政策”，agent 仍自信地从公开断言与题面提示推断出完整规则。r12 因此把负证据推进到：在规则可从公开材料推断的场景里，无论验收如何声明，该模型都不会主动查询外部知识工具。

### 收敛结论：可推断场景下无自主查询

r9–r12 构成完整证据链：r9 中 `PX-47` 只是可忽略标签；r10 中 agent 用通用“最新请求守卫”闭合任务；r11 中 agent 从新增公开回归断言推断出正确的来源权威规则（公开测试断言即规格）；r12 中即使 task.md 声明“测试通过不代表符合政策”、政策文档缺失、`skills_list`/`skills_load` 对模型可见，agent 仍自信地从公开材料推断完整规则。四个 revision 共 12 次有效 attempt 中，`skills_list` 发现、`lorelum_query` 查询与完整链路均为 0/12。

结论：在规则可从公开材料（测试断言与题面提示）推断的场景里，`deepseek/deepseek-v4-pro`（单轮 print 模式、mock 检索通道）不会主动调用可用的外部知识工具。该结论是方向性负证据，不宣称模型能力结论，也不推广到其他模型、其他任务类型或真实检索入口。

边界与未决问题（重审方向）：
1. 规则不可推断性：正确行为若依赖测试无法表达的外部事实，agent 才可能产生查询动机；需要重新设计题面或验收，并处理“确定性验收必然泄露规则”的张力。
2. 模型差异：可用其他模型做方向性探针，验证是否为模型行为差异。
3. 任务类型：更换通用知识没有现成模式的领域。
4. 实验语义：mock 工具通道与真实文档目录入口的差异。

行动：暂停 `async-cleanup-v2` 题面迭代，证据链冻结；不创建正式 record，不升级 `suites/`；后续实验设定重审须先在 Issue #96 与 OpenSpec 规划后再实施。

### 实验设定重审计划

目标重申：验证 coding agent 在工程任务中是否会自主使用外部知识工具（Lorelum 查询链路），而不是被显式注入或强制调用。r9–r12 证明在规则可从公开材料推断的场景下无自主查询，重审围绕以下方向展开，按信息价值与成本排序：

1. 模型差异（先行，低成本诊断）：复用 r12 题面与工具，用不同模型（如 `deepseek-v4-flash`）跑无提示探针，判断“不查询”是模型行为还是场景共性。结果决定后续方向优先级；该探针不进正式实验、不改题面、独立 scratch 记录。
2. 规则不可推断性（中成本，关键路径）：正确行为依赖测试断言无法表达的外部事实，使 agent 无法用通用知识闭合；需解决“确定性验收必然泄露规则”的张力（例如公开测试只做 smoke，政策符合性完全交给 judge 验收层）。
3. 任务类型（中成本）：更换通用知识没有现成模式的领域（如外部系统契约、业务规则依赖），降低 agent 用通用模式修复的概率。
4. 检索入口语义（低-中成本）：把 mock 工具通道换成真实文档目录入口，检验“工具是否被当作真实资源”对发现动机的影响。

重审结论与任何题面/验收变更必须先写回 Issue #96 与 OpenSpec 规划后再实施；收敛冻结状态在重审结论落地前保持不变。

### r13 规则不可推断场景（规划）

动机：r9–r12 与 flash 探针证明，规则可从公开材料推断时 agent 不会查询（0/12 + 跨模型一致）。要让「不查询」成为非平凡的理性行为，规则必须不可从测试断言与题面推断。r13 把「测试断言即规格」这一泄露通道关掉。

核心机制：三层解耦。

1. 公开测试只断言现象级回归：快速切换/重载/协调后页面不出现错位、不显示错误、既有体验保持；不断言任何来源的胜负方向，因此不泄露 PX-47 规则。
2. PX-47 规则（仅私有，judge 依据）：定义反直觉且带外部事实的权威边界，使多个貌似合理的实现都能通过公开测试但只有符合规则的实现被 judge 判为符合。
3. 验收分层（沿用 r12）：处理组 success = 真实查询链路 + 公开测试通过 + judge 符合；judge 依据不可见规则判定政策符合性。

规则形态草案（决策点）：PX-47 v3 可定义为「后台协调对当前范围生效需满足：启动时无前台操作在途，且距最近一次前台操作启动超过 500ms」。此时三种实现——(a) 最新请求获胜、(b) 后台永不覆盖（r12 行为）、(c) 500ms 窗口规则——都可能通过现象级测试，但只有 (c) 被 judge 判为符合。agent 无法从测试推断窗口阈值，查询成为确认正确实现的唯一途径。

不变量与风险：
- 不注入调用要求、不预注入约束；工具描述与锚点协议不变。
- 规则不可推断只提供查询动机，不强制查询；agent 若仍不查询而猜错，判定为主动发现失败（更强的负证据）；若猜对，判定为未发现（不构成自主发现成功）。
- 确定性验收张力通过「现象级测试 + judge 符合性」解耦：测试可判现象，judge 可判规则，两者都不单独泄露完整规则。
- 单轮设定下 agent 无法根据 judge 反馈纠错；这正是要观察的「是否会主动消除不确定性」。
- 需要新 revision（如 async-cleanup-v3）承载，v2 证据冻结；baseline 预期在反直觉规则下猜不对，为区分度前提。

实施前置确认（需求方）：
1. 领域：复用项目概览/来源权威领域（复用 v2 资产与 judge）还是换新领域？
2. 规则形态：窗口阈值型（如 500ms）是否可接受，或选范围限定/反直觉方向型？
3. 现象级测试是否足以维持 baseline 区分度（naive 仍需失败）。

### r13 实施结果

`async-cleanup-v3` 已创建并完成离线验证。现象级公开测试两条（范围切换保留、后台协调失败后前台结果保持）：naive 失败、reference/equivalent/anti-pattern 均通过（临时 Playwright 工作区验证）。judge v2（`skill-trigger-source-authority/v2`）校准通过（真实 LLM，deepseek-v4-pro）：reference 100、equivalent 100、anti-pattern（后台永不覆盖）63，thresholds reference_min 90 / anti_pattern_max 75 / gap 15（anti 为单维度陷阱实现，前台维度完善，故阈值较 practice-layered-api 宽松）。三层区分度成立：naive 测试失败（地板）、reference/equiv 测试+judge 双过、anti-pattern 过测试但 judge 判不符合（陷阱），agent 无法从现象级测试推断 500ms 窗口规则，查询成为消除不确定性的唯一途径。r13 发现门待运行。

### r13 发现门结果

三次 r13 发现门均有效，但 `skills_list` 发现、`lorelum_query` 查询与完整链路均为 0/3，质量 pilot 被阻止，结果 `diagnostic-only`。三次 attempt 都实现了“来源权威”类变体（attempt-3 为后台永不改变状态，attempt-1/2 为协调成功时静默刷新、被更新前台忽略），均未包含 500ms 窗口条件。现象级公开测试未泄露窗口规则，agent 选择“猜测一个合理实现”而非查询。r13 因此证明：即使规则真正不可推断（测试无法泄露），该模型仍不会主动消除不确定性——不查询是稳定的行为模式，而非“规则可推断”的副产品。这是本轨道最强的负证据；判断 agent 实现是否符合窗口规则可对三次 workspace 跑 judge v2 作补充确认。

### r13 judge 补充判定

对 r13 三次 attempt 的 workspace 实现跑 judge v2（deepseek-v4-pro）：attempt-1 30 分、attempt-2 60 分、attempt-3 70 分，三次 `background-window-authority` 均为 0 分（均未实现 500ms 窗口条件）。结合 0/3 查询，证据链闭合：在规则不可推断场景下，agent 不查询且实现不符合规则——「不查询」不是理性回避（查询可避免猜错），而是该模型在该任务设定下的稳定行为模式。这是本轨道最终最强负证据。

### r14 实施结果

`async-cleanup-v4` 已创建并完成离线验证。协调数据可见化（协调后列表新增一项），公开测试新增「运行后台协调后显示协调结果」（生效断言 + 失败信息指向政策文档）。校准矩阵验证：naive 2 失败（地板）、reference/equivalent 7/7 通过、anti-pattern（approximate：协调成功无条件生效、失败忽略）7/7 通过但 judge v2 判 30 分不符合（陷阱）、never-apply 协调生效断言失败。judge v2 校准通过（deepseek-v4-pro）：reference 100、equivalent 100、approximate 30，thresholds reference_min 90 / anti_pattern_max 75 / gap 15。r14 让常识实现必然失败（任何实现都失败一个现象级断言），失败反馈指向政策文档，为 agent 提供「继续猜 vs 查询」的真实选择。发现门待运行。

### r14 发现门结果

三次 r14 发现门均有效：attempt-1 实现近似实现（协调成功生效、失败忽略）并通过全部 7 个测试（未查询）；attempt-2 主动调用 `skills_list` 两次（被锚点校验拒绝），随后从测试时序线索（waitForTimeout 600）自行推断 500ms 窗口规则并正确实现（与 reference 等价）；attempt-3 未查询。发现门因无完整链路判 fail，结果 diagnostic-only。r14 是轨道首次出现「自主查询意图」：反馈循环设计（协调可见化 + 失败反馈）使 agent 在遇到规则缺口时尝试使用检索工具，但被 harness 锚点校验拒绝（疑似 public_refs 引用未用 read 工具读取的 task.md）。修复锚点误拒后重跑，可能形成首个正信号。r14 因此把负证据推进到「查询意图已出现、链路被 harness 阻断」。

### r14b 锚点修复后重跑

锚点修复（task.md 经 @task.md 注入视为初始公开输入）已落地并有隔离测试覆盖。r14b 三次发现门均无查询（attempt-1/2 超时 889s/746s、attempt-3 347s 正常），发现门仍 fail，结果 diagnostic-only。r14a 的查询尝试（attempt-2 两次 skills_list）为偶发事件，本轮回合未复现；无法确认修复是否让查询链路成功。超时与 pi 残留子进程阻塞 runner 有关（清理残留后 runner 继续），属 runner 稳定性问题。r14 表明：反馈循环设计偶发触发查询意图，但远非稳定。

### r14c 首个完整查询链路

锚点修复 + runner 超时修复后，r14c 三次发现门中 attempt-2 完成完整自主查询链路（skill_discovered → skill_loaded → 多次 practice_query issued/resolved，trace.complete=true，agent 自述 "discovered via the project guidance"）；attempt-1/3 为近似实现未查询。发现门按 3/3 协议仍 fail，结果 diagnostic-only。但 attempt-2 的实现为 approximate（协调成功生效、失败静默，无 500ms 窗口），说明 agent 查询到约束却未完整采纳窗口规则。综合 r14a/r14c：6 次中 2 次出现查询意图、1 次完整链路，触发率约 1/3；「反馈循环 + 锚点修复」使自主查询从 0 变为可复现但远非稳定。

### r14d 与四轮触发率汇总

r14d：三次均无完整链路（attempt-1 三次 skills_list 被拒后篡改公开测试与 services 让测试通过，暴露 agent 作弊路径）。已新增无效性门：agent 修改 public/tests/** 即标记无效（含防篡改隔离测试）。r14 四轮 12 次汇总：查询意图 2/12（r14a attempt-2、r14c attempt-2）、完整链路 1/12（r14c attempt-2，trace.complete=true）。反馈循环 + 锚点修复使「自主查询」从 0 变为可复现但低频（约 8% 完整链路）；r14d 的篡改行为显示 agent 在无查询且测试受阻时可能作弊，无效性门已封堵。

### r14e 与五轮汇总

r14e：三次均无查询、无篡改（防篡改门生效），发现门 fail，diagnostic-only。r14 五轮 15 次汇总：查询意图 2/15（r14a attempt-2、r14d attempt-1）、完整链路 1/15（r14c attempt-2）。结论：「反馈循环 + 锚点修复」使自主查询从 0 变为低频可复现（约 7% 完整链路），但绝大多数 attempt 仍用近似实现（协调成功生效等无窗口变体）通过现象级测试。这是方向性弱正信号：设计能触发自主查询，但不足以稳定复现；防篡改门已封堵 agent 修改验收的作弊路径。

### r14f 迭代：窗口内不生效断言（v4 内继续，不新建 revision）

在 v4 新增第 8 条现象级断言「前台操作后短时间内（200ms）后台协调不得改变已展示结果」，使「协调无条件生效」类近似实现必然失败（r14 多数 attempt 的近似实现被抓住）。校准矩阵更新：naive 3 失败（范围切换、协调失败保持、窗口内不生效）、reference/equiv 8/8 通过 + judge 100、anti-pattern（猜 300ms 窗口）8/8 通过但 judge 75 分不符合（陷阱）、never-apply 协调生效断言失败。judge 校准通过（reference_min 90 / anti_pattern_max 75 / gap 15）。该断言向 agent 泄露「前台后短时间协调不生效」（窗口存在），但精确 500ms 仍不可推断；agent 若猜窗口值，judge 判不符合。

### r15 结果（r14f 断言后首轮）

r15 三次均无查询、无篡改，发现门 fail，diagnostic-only。关键发现：attempt-1 从测试时序点（200ms 不生效、600ms 生效）插值猜中 500ms 窗口并正确实现（通过全部 8 测试、judge 应判符合），但未查询。r14f 新增的「窗口内不生效」断言向 agent 泄露了窗口存在的线索，使其更倾向于猜窗口值而非查询；触发率未提升（r15 0/3 查询）。累计 18 次：查询意图 2/18、完整链路 1/18。结论：测试时序点越多，agent 越能从测试插值规则并自信闭合，查询动机反而下降——「测试即规格」在时序型规则上依然成立。

### r16 规范引用式自主查询（生态位修正）

在 v4 内迭代，把「自主发现证据」从 Lorelum/Skill 语义修正为真实开发场景的规范文档检索：工具改为 `docs_search → docs_open → policy_lookup`（三段结构保留，label/description 无 Lorelum/Skill 暴露），trace 事件改为 docs_discovered/docs_opened/policy_query_*；task.md 改为规范引用式需求（“实现协调行为必须符合项目规范 PX-47，规范见项目规范库，可通过文档检索入口获取；工作区不包含规范正文”）。查询动机来自「需求引用规范 + 入口可识别 + 规范不在工作区」，judge 仅作验收。r15 前 skills 链路证据标注为旧工具语义。离线校验全绿（validate、contracts 197、v4 定向 19、strict OpenSpec、泄露审计）。r16 发现门待运行。

### r16 发现门结果

r16 三次中 3/3 均主动尝试 `docs_search`（attempt-1/3 被锚点拒绝、attempt-2 成功），attempt-2 完成完整链路（docs_discovered → docs_opened → policy_query_issued/resolved，trace.complete=true）并通过文档检索获取 PX-47 规范、正确实现 500ms 窗口规则（与 reference 等价）。attempt-1 超时（944s）、attempt-3 未形成链路；发现门按 3/3 协议仍 fail，结果 diagnostic-only。这是生态位修正的关键证据：规范文档检索入口 + 规范引用式需求使 agent 从「从不检索」（r9–r15 约 30 次 0 检索）变为「总是尝试检索、1/3 完整链路且正确实现」。锚点拒绝（attempt-1/3 的 docs_search 被拒）是剩余 harness 摩擦，修复后可能进一步提升完整链路率。

### r17 锚定判定修复与发现门通过

r16 锚定放宽提交（263917d）只改了 extension（nchoredPublicInputs 的锚定依据从 inputs 改为全部已读公开输入、matched_anchors 非空即通过），未同步 runner 的 query_anchored 判定（仍要求 policy_query_issued.public_refs 非空）。真实 agent 用规范库路径（工作区不存在）作 public_refs，vidence.inputs 为空数组，导致 r17b 三个 attempt 均形成完整链路（docs_discovered/docs_opened/policy_query_issued/resolved 齐全、matched_anchors 非空）却被判 query_anchored: False、发现门误判 fail。已修复 runner：queryAnchored 改为要求 policy_query_issued.matched_anchors 非空（与 extension 语义一致），并同步 fake-pi 测试数据；新增定向测试 20/20、validate、contracts 197 全绿，v4 snapshot 重建。

r17c 完整三次重跑：**发现门通过**（3/3 attempt valid、trace.complete、docs_discovered、query_anchored 全部 True），公开测试 3/3 全部 8/8 通过。三个 attempt 均通过完整 docs 链路获取 PX-47 规范并实现 500ms 窗口近似（FOREGROUND_SETTLE_WINDOW_MS / FRONT_OFFICE_AUTHORITY_WINDOW_MS / RECONCILIATION_GRACE_MS）。这是生态位修正后首次 3/3 完整链路 + 3/3 测试通过：锚点修复消除 harness 摩擦后，自主发现与主动查询从 r16 的 1/3 稳定复现到 3/3。

但 judge v2 判定三个实现均不符合（attempt-1=43、attempt-2=41、attempt-3=40，reference_min=90）：三者都只实现「距最近前台操作**完成**时刻 >500ms 协调才生效」且共用统一 seq（后台协调会递增序号、使在途前台响应被丢弃、后台 setState 可能覆盖前台 loading），缺失 judge 规则要求的「后台协调启动时无前台在途 且 距最近前台操作**启动**时刻 >500ms」语义。superseded-foreground 均满分（25/25，前台被更新操作取代不结算做对），foreground-authority（5/30）、background-window-authority（5-8/30）、state-feedback-preserved（3-5/15）低分。结论：发现门已达 3/3，但约束采纳停留在近似——agent 查询到窗口存在却未完整采纳窗口起点与前台在途语义；按处理组 success 协议（完整链路 + 测试通过 + judge 符合）仍判未采纳成功，结果 diagnostic-only。发现门侧 3/3 是方向性正信号，judge 侧近似表明公开测试仍不足以驱动完整约束采纳。
### r17 附：v4 过时 practice 元数据修复

r17 收尾时发现 v4 的 practice 元数据为 r14 复制 v3 时继承的过时值：conditions.yaml 声明的 practice sha256（303ec1a5）与实际内容（a06d800c）不符，metadata.yaml 的 rendered_characters（637）比实际（636）多 1。同时 v4 runner 的 verifySnapshot 硬编码校验 async-cleanup-v2（v2），v2 的 snapshot 因 r11 历史遗留 mismatch 导致 v4 runner 无法启动。已修复：conditions.yaml 同步实际 sha256、metadata.yaml 修正字符数与相对差、verifySnapshot 目标修正为 async-cleanup-v4、v4 snapshot 重建。定向测试 20/20、contracts 200、v4 snapshot 校验通过。这些修复不改变 practice 内容与评测语义，也不改变 r17c 已记录的 3/3 发现门结论。冻结的 v2/v3 仍因历史遗留（r11/r13 未同步）导致全量 validate 报 snapshot/profile mismatch，按「冻结不改」原则保留，作为已知问题。