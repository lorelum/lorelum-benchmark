# async-cleanup-v2

skill-trigger-orchestration 轨道的第一个候选任务。

## 场景

项目概览页同时有范围导航、同范围手动重载与后台协调。`PX-47` 定义这些来源的
结果权威；baseline 把三种来源等同为最新请求，因此后台协调会覆盖仍有权的前台结果。

## 结构

- `public/task.md`：以三个项目操作来源与缺失的 `PX-47` 政策描述可观察行为，不提示 Skill 或固定实现。
- `public/starter/app/`：完整自带的 naive starter（Vite + React 19 + TS）。
- `private/candidate.yaml`：kernel 声明（core v1 / profile
  skill-trigger-orchestration/v1 / materializer react-vite）。
- `private/conditions.yaml`：三条件（baseline / lorelum-retrieval /
  irrelevant-practice）。
- `private/practices/`：mock Practice 卡（项目操作来源权威）与无关 Practice（表单
  校验），同模板、近似长度。
- `private/evaluator/verify-operation-authority.ts`：AST 探针，要求项目加载实现
  可见地处理后台协调来源与结果归属。
- `private/evaluator/verify-operation-authority-runtime.ts`：分别验证跨范围、同范围
  重载与后台协调时，非权威操作 resolve 或 reject 都不调用视图状态 setter。
- `private/oracle.yaml`：语义门 + 质量探针声明。
- `private/execution/run-local.ts --qualification`：显式调用的真实 Pi 工具可达性
  canary，独立输出且不计入候选实验。

## 三条件对照

- baseline：地板，无 Skill、无查询。
- lorelum-retrieval：实验组，先通过独立 canary 和三次完整 mock 发现门，再可进入质量 pilot。
- irrelevant-practice：盲从检测，mock 返回无关 Practice 的约束。
