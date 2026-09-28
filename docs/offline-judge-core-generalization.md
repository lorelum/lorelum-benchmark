# 离线 Judge core 跨场景通用性验证报告

本文是一份**证据报告**，服务于 OpenSpec change `offline-judge-core-generalization`（Issue [#225](https://github.com/lorelum/lorelum-benchmark/issues/225)）。它是原型诊断结果，不是稳定契约，也不是平台默认实现。

结论只适用于本文冻结的模型、runtime、core、system prompt、场景与标签。它不构成任何全领域、全证据形态或所有小模型的评分能力声明。

## 1. 待验证断言

固定同一个离线 Judge core、system prompt 主体、输出协议（pairwise `A | B | tie | insufficient`）和确定性聚合规则后，只新增 scenario profile、evidence adapter、固定 rubric 与 calibration labels，能否：

1. 在两个代码类证据开发场景（Gateway v3、Source-authority v2）达到预先声明的开发门槛；
2. 在**不改动 core/prompt** 的前提下，把同一设施迁移到新证据形态（Compaction 自然语言摘要 holdout）并达到 holdout 门槛。

## 2. 冻结身份

| 项 | 值 |
| --- | --- |
| 模型 | `Qwen/Qwen3-1.7B-GGUF` |
| 模型 revision | `90862c4b9d2787eaed51d12237eafdfe7c5f6077` |
| 量化 / 文件大小 | `Q8_0` / `1834426016` bytes |
| 模型文件 SHA-256 | `061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a` |
| runtime | llama.cpp `b11207`（Windows CUDA 13.4 x64 native） |
| binary / CUDA runtime zip SHA-256 | `3efd633317d9eec15518c21c73641fa637a000c3aea88c6fe4158befe16635b1` / `738f8c251ac22b70c3ae6f83a10cf222725df0395246a2cf58f32bdb85fbe668` |
| 服务边界 | `http://127.0.0.1:8080`，`--ctx-size 8192`，`--parallel 1`，关闭 thinking |
| 采样参数 | `temperature=0`，`top_k=1`，`seed=20260927`，`max_tokens=256` |
| core hash | `19e12acbba8c8e36c2c8af95563aa1a3710d408155c316f8cef44270f1e1baa7` |
| system prompt hash | `cb208b302d36f9ccfc261abfc1ae981f159c8b93d0d00ddca04b1c45af260c14` |

三个运行（两个开发 + 一个 holdout）共享同一 `core_hash` 与 `system_prompt_hash`。模型权重与 runtime binary 不入库，只保留 locator、hash、启动参数与验证脚本。

## 3. 冻结门槛

来自 `src/benchmark/judge/offline-core/v1/private/calibration/thresholds.json`：

| 指标 | 门槛 |
| --- | --- |
| schema / citation validity | 100% |
| development decisive accuracy | `>=80%` |
| holdout decisive accuracy | `>=75%` |
| equivalence stability | `>=75%` |
| order consistency | `>=75%` |
| unexpected abstain（充分证据上） | `<=10%` |
| insufficient controls | 必须全部 abstain |
| high-confidence errors（每场景） | `<=1` |

## 4. 结果总览

所有三个场景的 `passed` 均为 `false`。

| 场景 | 断言 | 判决数 | schema | citation | decisive acc | 等价稳定 | 顺序一致 | 意外 abstain | 高置信错误 | 通过 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Gateway v3 | development | 24 | 100% | 100% | 0/16 | 0/4 | 75% | 17/20 | 10 | 否 |
| Source-authority v2 | development | 24 | 70.8% | 70.8% | 1/16 | 1/4 | 58.3% | 11/20 | 6 | 否 |
| Compaction summary v1 | holdout（仅运行一次） | 16 | 62.5% | 62.5% | 0/8 | 0/4 | 25% | 8/12 | 4 | 否 |

原始逐 decision 结果保存在：

- `src/benchmark/judge/offline-core/v1/private/runs/gateway-v3.json`
- `src/benchmark/judge/offline-core/v1/private/runs/source-authority-v2.json`
- `src/benchmark/judge/offline-core/v1/private/runs/compaction-summary-v1.json`

## 5. 逐场景结果

### 5.1 Gateway v3（development）

- `run_id`：`13260b86ed8aaf835bac03f1880ab72503a98c311cad9fa35de35300ee7efded`
- schema / citation 均 100%：模型能稳定产出 schema 合法的短 JSON，且从不引用未知 evidence id。
- decisive accuracy `0/16`、equivalence stability `0/4`、意外 abstain `17/20`：模型几乎不区分好坏，倾向返回 `insufficient` 或 `tie`，很少给出 `A`/`B`。
- 高置信错误 10 个 case：错误 verdict 同时被标为 `high` confidence。

典型失败样例（`gateway-reference-vs-anti`，A=reference，B=anti-pattern）：

```
AB  state=insufficient  verdict=insufficient  confidence=high
reason: Both candidates lack sufficient evidence to determine if raw payloads ...
```

同一 pair 反向后变成 `tie`，说明该 pair 的判决主要由顺序/噪声驱动，而不是由证据驱动。

### 5.2 Source-authority v2（development）

- `run_id`：`0f81e42cdb46be0fdaa9ba28378626dbb61ae47bfd649c102b53f9f2b6f4d6c4`
- decisive accuracy `1/16`、equivalence stability `1/4`、意外 abstain `11/20`：判别力同样不足。
- schema / citation validity 只有 70.8%（7/24 为 `invalid`）：
  - 模型把 `A:tests/dashboard.spec.ts` 幻觉成 `A:tests/dashboard.spec.tsx`，触发未知 evidence id fail closed；
  - 模型对 `verdict=A/B` 给出 `contradicts` 或 `insufficient` 的 relation，触发 relation/verdict 冲突 fail closed；
  - 模型给出 observed verdict 但只引用一个候选的 evidence，触发双向引用校验 fail closed。

典型失败样例（`authority-reference-vs-anti-full`，A=reference，B=anti-pattern）：

```
AB  state=observed  verdict=tie  confidence=high
reason: Both candidates support the criterion with sufficient evidence.
```

reference 与 anti-pattern 的判别差异位于被投影的代码窗口内（`WINDOW_MS` 取值与 reconciliation 快照逻辑），并非投影截断或 private 泄漏所致；因此该失败反映的是模型判别力，而非 adapter 缺陷。

### 5.3 Compaction summary v1（holdout，仅运行一次）

- `run_id`：`da026580647b6a495f6cb451f9ad9feceded6ac19efb38f0ff3138c75c7f9cdf`
- decisive accuracy `0/8`、equivalence stability `0/4`、order consistency `25%`、意外 abstain `8/12`、高置信错误 4。
- schema / citation validity 62.5%（6/16 为 `invalid`）：即使在纯自然语言、证据量很小的场景下，模型仍频繁违反 relation/verdict 一致性和双向引用约束。
- 典型：`compaction-evidence-boundary` 在 AB 方向判成 `B`（标签为 `A`），反向即被判为 `invalid`。

该 holdout 在 core、prompt、模型、runtime、schema、聚合与门槛冻结之后只显式运行了一次；失败结果按预先规则保留，未据此回调 prompt、labels 或阈值择优。

## 6. insufficient controls 的说明

三个场景各含 2 个 insufficient control，A/B 双向共 4 次判决，全部记为 `insufficient`。但需要明确：这些 control 由 adapter 的 `insufficient_reason` 触发 core 短路，模型并未参与判断。因此“insufficient controls 全部 abstain”验证的是 **core 的 fail-closed 路径**，而不是模型在证据不足时的 abstain 行为。该门槛的通过不代表模型具备 abstain 能力。

## 7. core / prompt zero-diff 证据

在开发场景完成、holdout 运行之前生成 before manifest；holdout 运行之后再生成 after manifest：

- `src/benchmark/judge/offline-core/v1/private/freeze-before.json`
- `src/benchmark/judge/offline-core/v1/private/freeze-after.json`

`compareFrozenCore` 结果：

```json
{ "passed": true, "changed_core_files": [], "prompt_changed": false }
```

即加入并使用 holdout 场景时，`types.ts`、`prompt.ts`、`core.ts`、`runtime.ts`、`metrics.ts`、`runner.ts` 与 system prompt 主体 hash 全部未变。

## 8. 允许的 holdout diff 边界

加入 Compaction holdout 时只新增了允许的材料：

- `scenarios/compaction-summary-v1/profile.json`
- `scenarios/compaction-summary-v1/adapter.ts`
- `scenarios/compaction-summary-v1/rubric.json`
- `scenarios/compaction-summary-v1/fixtures.json`
- `private/calibration/labels/compaction-summary-v1.json`

core、system prompt 主体、输出协议、decision mapping 与 aggregation 未改动。

## 9. 决定分类回顾

会改变评测语义、必须重新规划的决定（本次未发生任何一项）：

- 改变 verdict 集合、abstain 条件、聚合规则或 success thresholds；
- 改变 rubric 来源、允许自动改写 rubric、把 criterion verdict 合成加权总分；
- 改变 dev/holdout 划分、holdout labels、模型规模上限或 core/prompt zero-diff 规则；
- 把本地 Judge 接入语义硬门槛、P1/Pi runner、正式 record 或公共契约。

仅属工程实现的决定（本次发生）：

- 文件路径、`private/runs` 结果落盘位置、CLI 输出参数；
- freeze manifest 的落盘位置与命名；
- 不改变 prompt 语义的报告渲染与解析。

模型 artifact 或 runtime 变化不属于纯工程变化：只要可能改变判断结果，就必须形成新的实验 identity 并重新校准。

## 10. 结论

**本次冻结配置的通用性断言未获支持。** 在预先声明的门槛下，同一个 core/prompt 确实可以被两个开发场景与一个 holdout 场景共用（zero-diff 成立），但 `Qwen3-1.7B` 在这三类证据上都达不到可靠判决：

- 代码类证据上判别力接近随机，且大量意外 abstain；
- 自然语言摘要 holdout 同样失败，说明问题不只是“代码太难”，也包括模型对输出协议（relation/verdict 一致性、双向引用）的不稳定执行；
- fail-closed 与 provenance 设施本身工作正常：非法输出、缺失 artifact、远端端点与私有标记都被确定性拦截，没有产生“低分代替失败”的隐患。

因此本 change 应作为**诊断性结果**收束：它回答了“3B 以下是否够用”这一问题（在本设施与场景下不够用），但没有证明跨场景通用评分能力成立。结论不外推为全领域评分结论。

## 11. 未解决问题

- 判别力不足与协议违例的占比无法从本实验分离：既可能是模型容量问题，也可能是输出协议对 1.7B 过重。需要独立的诊断实验，而不是在 holdout 上回调 prompt。
- evidence 投影预算（每候选最多 6000/7000 字符、最多 6 个文件）与 1.7B 上下文能力的关系未单独评估。
- 若未来改用更大（仍 `<=3B`）的 artifact 或不同 runtime，必须新建实验 identity 并重新校准；本次结果不能沿用。
- 是否把 pairwise 之外引入成对比较校准、或把该设施接入 #209、公共 provider/schema、P1/Pi runner，都属于需要另立 change 的语义决定，本报告不作承诺。

## 12. 复现命令

```powershell
# 普通 CI（不加载模型）
bun run test:contracts:core
bun run validate

# 显式本地运行（模型与 runtime 已就绪，loopback 服务已启动）
bun run judge:offline:freeze -- src/benchmark/judge/offline-core/v1/private/freeze-before.json
bun run judge:offline -- src/benchmark/judge/offline-core/v1/scenarios/gateway-v3 --runtime-config <runtime.json> --claim development --out src/benchmark/judge/offline-core/v1/private/runs/gateway-v3.json
bun run judge:offline -- src/benchmark/judge/offline-core/v1/scenarios/source-authority-v2 --runtime-config <runtime.json> --claim development --out src/benchmark/judge/offline-core/v1/private/runs/source-authority-v2.json
bun run judge:offline -- src/benchmark/judge/offline-core/v1/scenarios/compaction-summary-v1 --runtime-config <runtime.json> --claim holdout --out src/benchmark/judge/offline-core/v1/private/runs/compaction-summary-v1.json
bun run judge:offline:freeze -- src/benchmark/judge/offline-core/v1/private/freeze-after.json
```
