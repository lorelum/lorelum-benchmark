# 独立验证报告：llm-provider-gateway-v1（practice-injection candidate）

## 0. 验证信息

- **验证人身份**：独立验证 subagent（与实现该 candidate 的主 agent 分离，只读为主；除本报告文件外未修改任何被跟踪文件，未提交，未调用模型）。
- **验证时点**：2026-08-10（Asia/Shanghai）；仓库 HEAD = `b7ce9bf`（`feat(candidate): add llm-provider-gateway-v1 practice candidate under #161`）。
- **验证对象**：`incubator/practice-injection/llm-provider-gateway-v1/`（纯后端 TypeScript/Bun 多供应商 LLM 网关 candidate；关联 issue #161 / PR #162）。
- **环境**：Windows / PowerShell；bun 1.3.1；node v22.21.0；`source_commit` = `dde8c03`（#160 merge，为 b7ce9bf 祖先）。
- **方法**：语义测试与 reference 覆盖测试在 `%TEMP%\lorelum-verify-llm-gateway\` 临时副本中执行；校准矩阵用 kernel calibrate + 独立 staging 重放；关键词扫描覆盖 public/ 全部文件；SHA-256 逐项复核。

## 1. 语义测试（真实环境）

### 1.1 pristine starter（public/starter/app 临时副本）

- `bun install --frozen-lockfile`：成功（typescript@5.9.3 安装）。
- `bun run test`：**0 pass / 10 fail**（18 次 expect 调用被实际执行）。
- 失败均为预期占位缺口：无 usage/cost 返回（undefined）、DeepSeek/Anthropic 未接入（仍返回 openai）、无 SSE（返回 application/json）、`/api/usage` 404、JSONL 日志不存在（ENOENT）、错误翻译缺失（返回 upstream_error 而非 authentication_failed/rate_limited）。
- **结论：符合 `candidate.yaml` 的 `baseline_expectation.functional: false`**（真占位，按设计失败）。

### 1.2 测试套件有效性（reference overlay 重放）

- 将 `private/calibration/sets/quality-probe/v2/overlays/reference/src/` 覆盖到临时副本 app 的 `src/` 后执行 `bun install --frozen-lockfile` + `bun run test`：**10 pass / 0 fail**（45 次 expect 调用）。
- 覆盖后语义实现（多供应商切换、SSE、usage 聚合、JSONL 日志、错误领域化）全部通过公开测试，说明公开测试套件本身有效、可实现、无自相矛盾。
- 另由校准矩阵重放确认 equivalent 同为 10 pass / 0 fail。

## 2. 校准矩阵重放

命令：`bun run src/benchmark/kernel/kernel.ts calibrate E:\lorelum-benchmark\incubator\practice-injection\llm-provider-gateway-v1 --output <临时空目录>`

- kernel calibrate 输出：`[{"role":"calibration-matrix","exitCode":0,"passed":true}]`，**calibration-matrix role 通过**。
- 独立 staging 重放（`LORELUM_CALIBRATION_SETS_MANIFEST` + `LORELUM_CALIBRATION_PUBLIC_STARTER`）逐样例结果：

| 样例 | semantic | practice_observation | 预期 | 结果 |
| --- | --- | --- | --- | --- |
| public-starter | fail | not-observed | fail / not-observed | 匹配 |
| reference | pass | observed | pass / observed | 匹配 |
| equivalent | pass | observed | pass / observed | 匹配 |
| anti-pattern | pass | not-observed | pass / not-observed | 匹配 |
| docs-present | pass | not-observed | pass / not-observed | 匹配 |

**5/5 通过**，与 `private/calibration.md` 声明一致。负例（docs-present）注入的 `docs/ai-gateway-guide.md` 与 oracle 卡内容 SHA-256 相同（`6a5d6c14...`），即"文档在场但代码不遵守 → not-observed"是真实判别。

## 3. 真实性审计（agent 视角）

- **task.md 口吻**：真实工单（背景：Ops 降成本/容灾；诉求：接 Anthropic、SSE、配置切供应商、用量费用统计、统一领域错误；结尾"改完跑一下测试确认没坏"）。无验收腔、无"应通过/验证标准"类表述。
- **占位真实性**：starter 仅硬编码 OpenAI 直连（`chatWithOpenAI` + `/api/chat`），无统一契约/适配器/记账/`/api/usage`/流式/错误翻译；`docs/gateway-api.md` 声明的是目标契约而非已实现能力——任务没有被提前做完。
- **公开测试有效性**：`tests/stubs.ts` 用本地 HTTP stub 服务器（openai/deepseek/anthropic 三种 wire 协议，含 SSE）断言可观察行为；无 `window.__` 埋点（后端任务，无前端埋点）、无假计数器（固定确定性响应属测试 stub 正常设计）。
- **package.json name**：`ai-gateway`，中性，不含 candidate id / benchmark 关键词。
- **public/ 基准痕迹扫描**：对 public/ 全部文件扫描 `评分|评测|基准|校准|泄露|实验|对照|盲评|注入|oracle|evaluator|calibration|practice|rubric|condition|snapshot|judge|score|LORELUM|frontend-guide|ai-gateway-guide|window.__|benchmark|treatment|metric|ground.truth|baseline|agent|观测|观察` 等 → **0 命中**（以明显存在的正常词做健全性检查，103 命中，证明扫描有效）。
- **public/ 无 `docs/ai-gateway-guide.md`**（确认不存在）；public/ 下无任何 private 材料进入（public 树共 11 个文件，逐一核对）。
- **public/starter/app 与 calibration candidate overlay 完全一致**：10 个文件 SHA-256 全部 MATCH（package.json、src/*、tests/*、docs/*、bun.lock、tsconfig.json、.gitignore）。
- **git-history.yaml 演进**：4 个提交（scaffold → feat(api) OpenAI 路径+文档 → test 覆盖 → `feat: gateway shell awaiting wiring`），演进自然；最后一个提交 `files: []` 依赖注释所述"add -A 捕获全部剩余（含条件注入的约定文档）"语义，属 runner manifest 设计，非伪造痕迹。
- **issue/PR 关联**：GitHub API 确认 issue #161 open（标题：新增多供应商 LLM 网关 Practice 案例）；PR #162 open、未合并、base=main、head=`b7ce9bf`，包含 2 个提交（`9af1953` OpenSpec proposal + `b7ce9bf` candidate 实现），符合"同一 PR 持续推进"的证据链规则。

## 4. 结构完整性

- 必需文件齐备且字段完整：`private/candidate.yaml`（id/lifecycle_stage/kernel/source/calibration_roles/calibration_sets/runtime/baseline_expectation）、`conditions.yaml`（v1、shared_execution、3 条件 + lorelum-retrieval unavailable、decision_rule）、`oracle.yaml`（semantic_oracle 6 断言、practice_observation 7 条职责、baseline_expected_result）、`practices/metadata.yaml`、`evaluator/evaluate.ts`、`evaluator/verify-provider-gateway.ts`、`evaluator/runtime-closure.yaml` + `runtime-closure/{package.json,bun.lock}`、`calibration/sets.yaml` + `calibration/run.ts`、`snapshot.json`（含完整 files 与 resolved 块）。
- **SHA-256 声明一致性**：oracle 卡 = conditions.yaml 声明 = docs-present 注入卡（`6a5d6c14...`）；irrelevant 卡 = `2919f1e5...`；tool-policy = `6acd34a2...`；runtime-closure lock input（package.json `da71ac16...`、bun.lock `5dbdeaec...`）与 runtime-closure.yaml 一致；reference/equivalent/anti-pattern overlay 文件哈希与 snapshot/sets.yaml 一致。
- **practices 长度与 relative diff**：`llm.provider-gateway.v1.md` 实际 413 字符 = 声明 `rendered_characters: 413`；`irrelevant.pagination.v1.md` 实际 407 = 声明 407；`actual_relative_difference: 0.0145278450363196` = 6/413（|413−407|/max），与两文件实际文本完全一致，且 ≤ `maximum_relative_difference: 0.10`。
- **`bun run validate`：失败（详见发现 F1）**。除 snapshot 门禁外，workspace layout 校验通过；snapshot 的 `resolved` 字段（core_hash/input_hash/calibration_sets_hash 等）未报 mismatch，说明根因仅在于文件集合覆盖不全。

## 5. 发现

- **F1（需修正，阻断快照门禁）**：`bun run validate` 退出码 1，仅此 candidate 报 2 项：
  - `Snapshot mismatch: incubator/practice-injection/llm-provider-gateway-v1/private/snapshot.json/snapshot_id`
  - `Snapshot mismatch: incubator/practice-injection/llm-provider-gateway-v1/private/calibration.md`
  根因：磁盘存在 `private/calibration.md`（校准记录文档），但 `snapshot.json` 的 files 映射未收录它（52 个磁盘文件 vs 47 个声明；practices/ 3 文件与 snapshot.json 本身按 profile/设计排除后，唯一多余文件就是 `private/calibration.md`）。声明的 `snapshot_id` 与其 files 映射自洽（复算一致），说明 snapshot 是在 `calibration.md` 加入前生成的、之后未重新生成。`tasks.md` 3.1/3.2 已勾选"snapshots intact / bun run validate 通过"，与实际仓库状态不符。**修正方式：将 `private/calibration.md` 纳入 snapshot（`bun run src/benchmark/snapshot.ts --incubator llm-provider-gateway-v1 --write` 或等价路径）并重新 `bun run validate`。**
- **F2（观察，非缺陷）**：`git-history.yaml` 末提交 `files: []` 依赖"add -A 剩余文件"语义（注释已说明），baseline 条件为无文件空提交；需 runner 侧语义确认，但不影响 candidate 真实性。
- **F3（按设计未执行）**：`judge-agent/generic/v1` 的 LLM 判别力校准未执行（需要 `LORELUM_JUDGE_REAL=1` 显式 opt-in 与 API Key），`tasks.md` 2.5 未勾选，与 change 声明一致；本次验证未调用任何模型。

## 6. 结论

**功能/语义/校准/真实性/结构类验证基本通过**：
- pristine starter 0/10 fail，符合 `baseline_expectation.functional: false`；
- 测试套件有效（reference 覆盖后 10/10 pass）；
- 校准矩阵 5/5 通过（public-starter fail/not-observed、reference pass/observed、equivalent pass/observed、anti-pattern pass/not-observed、docs-present pass/not-observed）；
- public/ 零基准痕迹、占位真实、口吻真实、name 中性、无 `docs/ai-gateway-guide.md`、无 private 泄露；
- 结构文件齐备、哈希声明一致、practices 长度与 relative diff 精确一致；issue #161 / PR #162 关联成立。

**需修正清单（1 项阻断）**：
1. **修复 snapshot 完整性**：`bun run validate` 因 `private/calibration.md` 未收录于 `snapshot.json` 而失败（snapshot_id + calibration.md 两项 mismatch）。需重新生成 snapshot 使 validate 全绿，并同步更新 `tasks.md` 3.1/3.2 的实际证据；在此之前 candidate 未通过"snapshot intact"生命周期门禁，不应进入模型调用/正式 record 阶段。

（F2/F3 为观察项，不构成修正要求。）