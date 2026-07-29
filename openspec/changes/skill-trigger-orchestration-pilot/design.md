## 设计推导

### 轨道边界

本轨道与现有两条轨道的区分点在 Practice 怎么来：前两条把处理变量喂给 agent，本轨道要求 agent 自己触发查询。

### 场景选择

候选场景：异步副作用生命周期超出组件（useEffect 发请求，组件卸载后 setState）。

选择理由：

1. agent 会做、但不知道该做的失败模式--它有能力写 cleanup，但默认不意识到这个场景该处理。属于不知道要做而非不会，符合待测变量。
2. 与 practice-injection 的 API 分层场景不重叠。
3. 技术栈选 SPA（Vite + React 19 + TS），待测变量隔离最干净，不引入 RSC 复杂度混杂；AST 探针结构清晰。

### mock 返回结构

三字段：范围约束、命中 Practice 的可审计引用（仅 id/version/SHA-256，不含原文）、行为约束（非指令，如异步副作用不得在组件卸载后继续影响状态，agent 自行决定实现方式）。Practice 卡原文保留在 private/，不进 mock 返回结构或模型输入。

### 对照组

三个 condition，不设 oracle-practice 天花板：baseline（地板）、lorelum-retrieval（实验组）、irrelevant-practice（盲从检测）。不设天花板的原因：实验组是否达标由 evaluator 独立判定；irrelevant-practice 升级为听懂约束的唯一旁证。

### 注入位置

放 prompt 层。harness 强约束会抹掉 agent 会不会听这个待验证变量。prompt 层文本注入保留该变量。

### baseline 预期缺陷

baseline 下 agent 写出不带 cleanup 的 useEffect。由 AST 探针稳定检出 useEffect 回调未返回 cleanup 函数。不依赖运行时 warning。

### 度量

主量看过程：trace 记录三层事件（发现并加载、查询已发生、采纳的约束），后续动作引用约束是听了的证据。辅量看结果：evaluator 通过。没有过程链、结果却碰巧对，不算。

### 风险与前置

- 场景偏简单，agent 可能表现过好导致 baseline 失败模式不成立。candidate 先跑本地 pilot 确认 baseline 下 agent 确实会失败。
- mock Practice 与 irrelevant Practice 用同一模板、近似字符数，控制文本长度混杂。

### Profile 契约（skill-trigger-orchestration/v1）

本轨道不复用 injection-calibration/v1 或 treatment-comparison/v1，新建 `skill-trigger-orchestration/v1` profile。理由：

- injection-calibration/v1 的 `lorelum-retrieval` 是 `status: unavailable`（只测显式注入，真实检索不可用）；本轨道 `lorelum-retrieval` 是实验组，必须 `status: declared`，走 mock 查询。
- injection-calibration/v1 的 Practice 通过 `condition-scoped-private-runtime` 通道由 runner 显式注入；本轨道的 Practice 不是显式注入，是 agent 触发 mock 查询后，把返回的三字段约束注入 prompt。需要新 channel：`mock-retrieval-prompt-injection`。
- injection-calibration/v1 的 decision_rule 是"oracle 严格高于对照"；本轨道无 oracle，decision_rule 是"lorelum-retrieval 过且 irrelevant-practice 不过"。

新 profile 的 conditions：

- baseline：status declared，channel none，无 Skill 列表、无查询。
- lorelum-retrieval：status declared，channel `mock-retrieval-prompt-injection`，agent 可见可发现 Skill 列表，触发后 mock 返回三字段约束并注入 prompt。
- irrelevant-practice：status declared，channel `mock-retrieval-prompt-injection`，mock 返回一条无关 Practice 的约束。

mock 查询返回结构进 profile 契约：`{ scope_constraint, matched_practice: { id, version, sha256 }, behavior_constraint }`，其中 behavior_constraint 为不得/必须式限制，非指令。

trace 记录三层事件：discovered_and_loaded、query_occurred、constraint_adopted，均为 redacted（不含 Practice 正文，只含 id/version/sha256）。

### 内核与 calibration 复用

candidate.yaml 声明 `kernel: { core: v1, profile: skill-trigger-orchestration/v1, materializer_kind: react-vite }`。calibration fixtures 复用 react-vite app-shell 共享 base + overlay 合成树（与 practice-injection 同源 base），通过 sets.yaml 声明 reference/equivalent/anti-pattern fixtures；base 路径归属为 `incubator/calibration-bases/skill-trigger-orchestration/v1/react-vite/app-shell`，若与 injection-calibration 共享同一物理 base 则在 sets.yaml 中显式声明跨 profile 共享并绑定 digest。naive starter 本身完整自带在 public/starter/app，不参与 overlay 合成。

### calibration fixtures 语义

calibration sets 声明三个 fixture，各自测探针的不同判据：

- reference：带 cleanup 的正确实现，MUST 通过 AST 探针。证明探针能接受正确实现。
- equivalent：命名/布局不同但职责等价的正确实现（如用 AbortController 而非 mounted 标志），MUST 通过探针。证明探针不把单一写法当唯一答案。
- anti-pattern：看似处理了实则没处理的绕过实现--例如在卸载后仍 setState 但加了个空的 cleanup 函数，或把请求挪到组件外但仍未取消。MUST 被探针拒绝。证明探针不漏判伪装正确的写法。

anti-pattern 与 naive starter 的区别：naive starter 是 baseline 预期产出（压根不写 cleanup，探针直接判失败）；anti-pattern 是 calibration 用的已知绕过实现（写了但无效，测探针的判别力）。两者不重复。
