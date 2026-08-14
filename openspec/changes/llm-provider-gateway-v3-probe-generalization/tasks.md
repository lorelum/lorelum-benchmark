## 1. Issue、OpenSpec 与初始 PR

- [x] 1.1 创建单一问题 issue #172，记录 #168 假阴/假阳证据、v3 边界与待确认问题。
- [x] 1.2 创建 `llm-provider-gateway-v3-probe-generalization` change，并补齐 proposal/specs/design/tasks。
- [x] 1.3 运行 `openspec validate llm-provider-gateway-v3-probe-generalization --type change --strict`，修正至通过。
- [x] 1.4 从最新 main 创建 `codex/llm-provider-gateway-v3-probe-generalization` 分支，提交仅含 OpenSpec artifacts 的变更并创建初始 PR（引用 #172，PR #173）。
- [ ] 1.5 完成规划澄清，将需求方对公开题面、命名变体标签与规范落点的回答写回 #172 与 design Planning Confirmation。

## 2. 通用结构探针规范与回归契约

- [ ] 2.1 确认 `practice-structure-probe-calibration` capability 的 stable 落点与 strict delta 语义。
- [ ] 2.2 设计 private naming-variant fixture 的分类、来源、sanitize 与固定 hash 规则；写入 design/verification。
- [ ] 2.3 增加候选本地 deterministic regression 入口：无模型、无网络、逐 fixture 输出 expected/actual/reason。

## 3. v3 candidate 公开与私有骨架

- [ ] 3.1 创建 `incubator/practice-injection/llm-provider-gateway-v3/`，独立 id/profile/source/snapshot 身份。
- [ ] 3.2 复制并冻结 v3 public 行为契约（task/starter/tests/docs），确保 public 面无语义泄露且与 v2 可对照。
- [ ] 3.3 编写 private candidate/conditions/oracle/practices/execution manifests；practice 与对照按已确认方案固定。
- [ ] 3.4 将 judge 声明固定为 `judge-agent/generic/v2` soft sidecar，不改变 joint-pass 派生。

## 4. 泛化探针与命名变体校准

- [ ] 4.1 实现 v3 private structure probe：import graph + 调用/数据流/所有权证据分类，封闭标识符不得单独决定结果。
- [ ] 4.2 实现 `private/evaluator/evaluate.ts` 与 runtime-closure：semantic 通过后运行 probe，输出 independent semantic/practice_observation。
- [ ] 4.3 在 `private/calibration/sets/quality-probe/v3/` 建立 reference/equivalent/type-based/docs-present/anti-pattern 与真实命名变体 overlays。
- [ ] 4.4 对 oracle rep1/rep3、irrelevant rep1 等变体完成人工/证据复核并固定预期标签。
- [ ] 4.5 运行 kernel calibration：naming-variant 正例 observed、碰撞/反模式 not-observed、public-starter fail+not-observed。

## 5. Judge 证据规范与测试

- [ ] 5.1 将 evidence-based criterion rationale 要求落实到 judge spec 与实现验收，不修改 provider/契约。
- [ ] 5.2 增加 judge naming-variant 校准测试与证据型 rationale 检查；保留既有 candidate 回归。
- [ ] 5.3 真实 judge 校准仅在前置条件齐备且显式授权后执行；未执行时记录 not-run/原因。

## 6. Snapshot、验证与审计

- [ ] 6.1 生成并验证 v3 snapshot，确认 v1/v2 与历史对象不变。
- [ ] 6.2 运行 `bun run validate`、OpenSpec strict、public/private 泄露审计、`git diff --check`。
- [ ] 6.3 独立 agent 执行真实环境验证：公开语义测试、v3 calibration、probe regression、真实性审计，并集成报告。
- [ ] 6.4 记录 v3 naming-variant calibration evidence 与 judge not-run/未执行原因。

## 7. 最终门禁

- [ ] 7.1 确认未调用模型、未创建正式 record、未升级 suite revision、v1/v2/suites/treatments/records 未变。
- [ ] 7.2 完成 PR 描述与证据链，保持单一声明范围并引用 #172。
