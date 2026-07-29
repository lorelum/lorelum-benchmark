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

三字段：范围约束、命中 Practice（引用与原话，可审计来源）、行为约束（非指令，如异步副作用不得在组件卸载后继续影响状态，agent 自行决定实现方式）。

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
