## 1. OpenSpec 与规划门禁

- [x] 1.1 创建 OpenSpec change 与 proposal/specs/design/tasks，关联 #170。
- [x] 1.2 运行 `openspec validate judge-agent-rubric-optimization --type change --strict`。
- [x] 1.3 提交仅含 OpenSpec artifacts 的变更并创建初始 PR（引用 #170，PR #171）。

## 2. Rubric 与解析优化

- [x] 2.1 扩展 `rubricQualityGuideline`，加入 fallback/retry/预算/幂等/流式记账/账本观测/伪兼容映射判据，并保留既有维度。
- [x] 2.2 更新 `assertScoredCandidate`，对 confidence 与 points 做有限数值归一，缺失/未知/重复/超范围仍 fail closed。
- [x] 2.3 在 `createJudgeAgentProvider` 支持 `LORELUM_JUDGE_RUBRIC_TEXT` 固定 rubric 复用（parse + hash），默认行为不变。

## 3. 测试与回归

- [x] 3.1 更新/新增 judge 单元测试，覆盖政策 rubric、数值归一、固定 rubric、mock 与既有 provider 回归。
- [x] 3.2 运行 `bun run test:contracts`、`bun run validate`、`git diff --check`。
- [x] 3.3 真实 opt-in 校准 `llm-provider-gateway-v2`（`LORELUM_JUDGE_REAL=1`），记录 rubric hash 与 reference/anti-pattern 分离证据。

## 4. 最终门禁

- [x] 4.1 确认未改变语义判定、未创建 record、未升级 suite，共享 provider 向后兼容。
- [x] 4.2 完成 PR 描述与证据链，引用 #170。
