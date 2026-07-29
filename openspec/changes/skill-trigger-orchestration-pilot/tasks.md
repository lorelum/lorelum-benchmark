## 1. Profile 契约（skill-trigger-orchestration/v1）

- [ ] `src/benchmark/kernel/profiles/skill-trigger-orchestration/v1/types.ts`：定义 conditions（baseline/lorelum-retrieval/irrelevant-practice，lorelum-retrieval 为 declared）、channel（mock-retrieval-prompt-injection）、mock 返回三字段结构、trace 三层事件类型、decision_rule。
- [ ] `src/benchmark/kernel/profiles/skill-trigger-orchestration/v1/runtime.ts`：解析 candidate 的 conditions.yaml、mock 查询声明、Practice 卡哈希；redacted trace。
- [ ] `profiles/index.ts` 注册导出新 profile。
- [ ] runtime 测试：覆盖 declared lorelum-retrieval、redacted trace、malformed 拒绝。

## 2. 候选工作区骨架

- [ ] `incubator/skill-trigger-orchestration/async-cleanup-v1/` 目录，含 public 与 private。
- [ ] candidate.yaml：kernel 声明（core v1 / profile skill-trigger-orchestration/v1 / materializer react-vite）、calibration_sets、calibration_roles。
- [ ] public/task.md：只描述可观察行为，不提示异步清理或 Practice。
- [ ] public/starter/app/：完整自带的 naive starter（Vite + React 19 + TS），useEffect 发请求不带 cleanup；不通过 overlay 表达该缺陷，避免改 overlay 即改 baseline 预期。calibration 的 base + overlay 仅用于 reference/equivalent/anti-pattern fixtures。
- [ ] private/snapshot.json。

## 3. mock 查询与 Practice 卡

- [ ] private/practices/oracle.async-lifecycle.v1.md：异步生命周期 Practice（行为约束形式）。
- [ ] private/practices/irrelevant.<topic>.v1.md：无关 Practice（同模板、近似长度）。
- [ ] private/practices/metadata.yaml：长度与独立评审记录。
- [ ] mock 查询返回三字段结构的实现，绑定 Practice id/version/sha256。

## 4. evaluator

- [ ] private/evaluator/verify-cleanup.ts：AST 探针查 useEffect 回调是否返回 cleanup。
- [ ] private/evaluator/evaluate.ts：组合语义检查与 AST 探针。
- [ ] private/oracle.yaml：语义门 + 质量探针声明。
- [ ] calibration/sets.yaml + overlays：reference（带 cleanup，通过探针）、equivalent（等价正确写法，通过探针）、anti-pattern（伪装正确实则无效，如空 cleanup，被探针拒绝）。

## 5. 对照与执行治理

- [ ] private/conditions.yaml：baseline / lorelum-retrieval / irrelevant-practice 三条件，固定模型/预算/工作区；lorelum-retrieval 为 declared。
- [ ] private/execution/tool-policy.yaml：public-only 工作区，私有材料不进模型输入。
- [ ] 本地执行器：三条件各两次，trace 记录三层事件，结果写 scratch/。

## 6. pilot 验证

- [ ] 跑 baseline pilot，确认 agent 确实写出不带 cleanup 的 useEffect。
- [ ] 跑 lorelum-retrieval pilot，确认 mock 链路可触发、约束可注入、trace 三层事件齐全。
- [ ] 跑 irrelevant-practice pilot，确认无关约束不致盲从通过。

## 7. 验收

- [ ] `bun run validate` 与 `bun run test:contracts` 通过。
- [ ] `npx openspec validate skill-trigger-orchestration-pilot --strict` 通过。
- [ ] trace 记录三层事件。
- [ ] lorelum-retrieval 过 evaluator 且 irrelevant-practice 不过。
