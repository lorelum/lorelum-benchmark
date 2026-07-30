# async-cleanup-v2

skill-trigger-orchestration 轨道的第一个候选任务。

## 场景

项目概览页：快速切换项目范围时，先前范围请求仍可能处理当前范围的状态。
baseline 预期缺陷是 useEffect 发起范围相关请求后直接处理 resolve 或 reject，未让旧范围
结果在范围变化后失效。

## 结构

- `public/task.md`：以范围切换故障与未解释的事故分类描述可观察行为，不提示 Skill 或固定实现。
- `public/starter/app/`：完整自带的 naive starter（Vite + React 19 + TS）。
- `private/candidate.yaml`：kernel 声明（core v1 / profile
  skill-trigger-orchestration/v1 / materializer react-vite）。
- `private/conditions.yaml`：三条件（baseline / lorelum-retrieval /
  irrelevant-practice）。
- `private/practices/`：mock Practice 卡（异步结果归属）与无关 Practice（表单
  校验），同模板、近似长度。
- `private/evaluator/verify-cleanup.ts`：AST 探针，检查发起异步副作用的
  useEffect 是否返回清理函数。
- `private/evaluator/verify-cleanup-runtime.ts`：分别验证旧范围 resolve 与
  reject 不调用状态 setter。
- `private/oracle.yaml`：语义门 + 质量探针声明。

## 三条件对照

- baseline：地板，无 Skill、无查询。
- lorelum-retrieval：实验组，走完整 mock 链路。
- irrelevant-practice：盲从检测，mock 返回无关 Practice 的约束。
