## 1. 候选工作区骨架

- [ ] 创建 `incubator/skill-trigger-orchestration/<task-slug>-v1/` 目录，含 public 与 private。
- [ ] public/task.md：只描述可观察行为（请求期间禁用、卸载后不报错等），不提示异步清理或 Practice。
- [ ] public/starter/app/：Vite + React 19 + TS 的 naive starter，useEffect 发请求不带 cleanup。
- [ ] private/candidate.yaml、private/snapshot.json。

## 2. mock 查询与返回契约

- [ ] private/mock/practice-oracle.md：异步生命周期 Practice 卡（行为约束形式）。
- [ ] private/mock/practice-irrelevant.md：无关 Practice（同模板、近似长度）。
- [ ] mock 查询返回三字段结构的定义与实现。

## 3. evaluator

- [ ] private/evaluator/evaluate.ts：AST 探针查 useEffect 回调是否返回 cleanup。
- [ ] private/oracle.yaml：语义门 + 质量探针声明。
- [ ] calibration：reference（带 cleanup）应通过、naive starter 应失败。

## 4. 对照与执行治理

- [ ] private/conditions.yaml：baseline / lorelum-retrieval / irrelevant-practice 三条件，固定模型/预算/工作区。
- [ ] private/execution/tool-policy.yaml：public-only 工作区，私有材料不进模型输入。
- [ ] 本地执行器：三条件各两次，结果写 scratch/。

## 5. pilot 验证

- [ ] 跑 baseline pilot，确认 agent 确实写出不带 cleanup 的 useEffect（失败模式成立）。
- [ ] 跑 lorelum-retrieval pilot，确认 mock 链路可触发、约束可注入。
- [ ] 跑 irrelevant-practice pilot，确认无关约束不致盲从通过。

## 6. 验收

- [ ] bun run validate 通过。
- [ ] trace 记录三层事件。
- [ ] lorelum-retrieval 过 evaluator 且 irrelevant-practice 不过。
