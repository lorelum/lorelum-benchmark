# async-cleanup-v2

skill-trigger-orchestration 轨道的第一个候选任务。

## 场景

项目概览页：范围切换和同范围手动重载都可能使较早的项目加载操作在较晚操作后结算。
baseline 预期缺陷是多个项目加载入口直接处理 resolve 或 reject，没有共享“最新操作”
的结果归属。

## 结构

- `public/task.md`：以范围切换、手动重载与不解释语义的项目政策编号描述可观察行为，不提示 Skill 或固定实现。
- `public/starter/app/`：完整自带的 naive starter（Vite + React 19 + TS）。
- `private/candidate.yaml`：kernel 声明（core v1 / profile
  skill-trigger-orchestration/v1 / materializer react-vite）。
- `private/conditions.yaml`：三条件（baseline / lorelum-retrieval /
  irrelevant-practice）。
- `private/practices/`：mock Practice 卡（异步操作归属）与无关 Practice（表单
  校验），同模板、近似长度。
- `private/evaluator/verify-operation-ownership.ts`：AST 探针，拒绝缺少可见
  操作归属机制的项目加载实现。
- `private/evaluator/verify-operation-ownership-runtime.ts`：分别验证跨范围和
  同范围重载时，旧操作 resolve 与 reject 都不调用状态 setter。
- `private/oracle.yaml`：语义门 + 质量探针声明。

## 三条件对照

- baseline：地板，无 Skill、无查询。
- lorelum-retrieval：实验组，先通过三次完整 mock 发现门，再可进入质量 pilot。
- irrelevant-practice：盲从检测，mock 返回无关 Practice 的约束。
