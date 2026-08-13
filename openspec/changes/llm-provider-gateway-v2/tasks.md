## 1. 规划与 OpenSpec 门禁

- [x] 1.1 创建 issue #166，确认六项规划决策并写回 issue 与 design Planning Confirmation。
- [x] 1.2 创建 OpenSpec change 与 proposal/specs/design/tasks artifacts，明确 v2 能力、公开契约、私有边界、校准与生命周期。
- [x] 1.3 运行 `openspec validate llm-provider-gateway-v2 --type change --strict`，修正至通过。
- [x] 1.4 提交仅含 OpenSpec artifacts 的变更，推送 `codex/llm-provider-gateway-v2` 并创建初始 PR（引用 #166，PR #167）。

## 2. Public 契约与占位 starter

- [x] 2.1 编写真实工单口吻 `public/task.md`：只声明可观察行为，不写适配器/政策/文件路径等内部实现建议，无 benchmark 痕迹。
- [x] 2.2 编写 `public/starter/app/docs/gateway-api.md`：chat JSON/SSE、usage 维度、四家供应商注册表、预算/幂等/流式失败契约、错误表、价目表与 rounding。
- [x] 2.3 编写占位 starter（package.json/bun.lock/tsconfig/types/openai/server）：仅硬编码 OpenAI 非流式直连，其余供应商与全部执行政策缺失，公开测试为红。
- [x] 2.4 编写公开测试 stubs：OpenAI/DeepSeek/Anthropic/Nebula 四种线协议及确定性失败模式（429 一次后成功、超时/中途断流、fallback、预算竞争）。
- [x] 2.5 编写公开语义测试，覆盖 spec 中全部可观察行为：配置切换、四家协议映射、fallback/retry 单次计费、租户预算并发、幂等命中/冲突、流式失败、JSONL/usage 聚合、领域错误。

## 3. Private manifests 与 treatments

- [x] 3.1 编写 `private/candidate.yaml`：独立 id、node-ts materializer、source/snapshot/profile 身份、calibration role 与 baseline expectation。
- [x] 3.2 编写 `private/conditions.yaml`：baseline/oracle-practice/irrelevant-practice，`max_duration_minutes: 25`、`repetitions: 5`、judge provider 与 joint-pass 决策规则。
- [x] 3.3 编写 `private/oracle.yaml`：语义断言与 practice_observation responsibilities，`baseline_expected_result: { semantic: fail, practice_observation: not-observed }`。
- [x] 3.4 编写 Practice 卡 `llm.provider-gateway.v2` 与等长无关对照 `backend.pagination`，以及 `metadata.yaml`；注入 `project-convention/v1`，target `docs/ai-gateway-guide.md`。
- [x] 3.5 编写 `private/execution/tool-policy.yaml` 与 `private/execution/git-history.yaml`，保持 agent 可见面仅 public、注入条件化、trace 只记版本/hash。

## 4. Probe 与 evaluator

- [x] 4.1 实现 `private/evaluator/verify-provider-gateway-v2.ts`：TypeScript import graph + AST 分类，按职责判定 observed/not-observed/indeterminate，不使用字符串正则启发式。
- [x] 4.2 实现 `private/evaluator/evaluate.ts` 与 runtime-closure，语义通过后运行 probe，输出独立 semantic/practice_observation。
- [x] 4.3 为 probe 增加聚焦单元/校准测试，保证等价实现可被接受、anti-pattern 可被拒绝。

## 5. 校准基座与矩阵

- [x] 5.1 只读复用 `injection-calibration/v2/node-ts/app-shell/v1`，新增 `private/calibration/sets.yaml` 与 `run.ts`。
- [x] 5.2 创建 overlays：public-starter、reference、equivalent、type-based、docs-present，以及 fallback/retry/租户预算/双计费/流式漏账/伪兼容分支 anti-pattern。
- [x] 5.3 经 kernel 运行完整校准矩阵，全部样例达到声明结果（reference/equivalent pass+observed，anti-pattern/docs-present 被正确分类，public-starter fail+not-observed）。

## 6. Snapshot、验证与独立审计

- [x] 6.1 生成并校验 v2 snapshot，确认独立身份且未触碰 v1 snapshot。
- [x] 6.2 运行 public/private 泄露审计：公开面无 benchmark/oracle/evaluator/calibration/practice 术语，无被测规范或私有路径。
- [x] 6.3 运行 `bun run validate`、OpenSpec strict、`git diff --check`，并记录验证证据。
- [ ] 6.4 由独立 agent 执行真实环境验证（starter 语义测试、校准矩阵、真实性审计），将独立报告集成到同一 PR。

## 7. 最终门禁

- [ ] 7.1 确认未调用模型、未创建正式 record、未升级 suite revision，v1 与现有对象未改动。
- [ ] 7.2 完成 PR 描述与证据链，保持单一声明范围并引用 #166。
