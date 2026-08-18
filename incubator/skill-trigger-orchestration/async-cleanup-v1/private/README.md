# async-cleanup-v1

skill-trigger-orchestration 轨道的第一个候选任务。

## 场景

项目概览页：组件在挂载时发起异步请求获取项目列表，组件卸载后异步副作用
继续影响状态。baseline 预期缺陷是 useEffect 发起请求后直接 setState，
未返回清理函数。

## 结构

- `public/task.md`：只描述可观察行为，不提示异步清理或 Practice。
- `public/starter/app/`：完整自带的 naive starter（Vite + React 19 + TS）。
- `private/candidate.yaml`：kernel 声明（core v1 / profile
  skill-trigger-orchestration/v1 / materializer react-vite）。
- `private/conditions.yaml`：三条件（baseline / lorelum-retrieval /
  irrelevant-practice）。
- `private/practices/`：mock Practice 卡（异步生命周期）与无关 Practice（表单
  校验），同模板、近似长度。
- `private/evaluator/verify-cleanup.ts`：AST 探针，检查发起异步副作用的
  useEffect 是否返回清理函数。
- `private/oracle.yaml`：语义门 + 质量探针声明。

## 三条件对照

- baseline：地板，无 Skill、无查询。
- lorelum-retrieval：实验组，走完整 mock 链路。
- irrelevant-practice：盲从检测，mock 返回无关 Practice 的约束。
