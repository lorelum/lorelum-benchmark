# Structure-fact 判别力研究（当前为离线设计）

本文件解释 v2-e 校准失败后的研究方案，并记录尚未调用模型时的离线实现证据。它不是修复成功的声明。

## 为什么不再让模型直接给结构分

v2-e 已经移除了模型自报分数，但每个维度仍只有一个宽泛的 full/partial/zero 文案 anchor。模型仍是在“做最终结构裁决”，多个源代码事实会被压成一个粗结论：

| 夹具 | v2-e 有效模式 | 诊断问题 |
| --- | --- | --- |
| reference | 多数维度停在 partial 半分，总分 50 | 一个合法替代布局被低估 |
| equivalent | 六维 full，总分 100 | 与 reference 反而相差 50 分 |
| anti-pattern | 多数 partial，总分 50 | 与 reference 无分离 |
| docs-present | 多数 partial，总分 55 | 文档/相似结构没有被从代码事实中隔离 |
| baseline-policy-scatter | 多数 partial，总分 55 | 策略分散实现没有被压到 reference 之下 |
| public-starter | 六维 zero，总分 0 | 低分正确，但无法证明 semantic-pass 负例也可判别 |

失败点在裁决粒度，不在 rubric hash、夹具身份或阈值。本阶段没有修改 task、starter、oracle、夹具、阈值、decision metric 或 rubric。

## 术语的通俗解释

- **structure fact（结构事实）**：从候选源代码里抽取的、可回答 true/false 的具体事实，例如“传输细节是否被隔离在 adapter 中”。它不是“你觉得好不好”的评分。
- **schema（事实表）**：预先声明的一组必答事实。模型必须穷举所有事实，不能少答、多答或自造问题。
- **evidence / source reference（证据 / 源引用）**：每条 true/false 都要给出具体代码证据，并引用 shown candidate source 中真实存在的 `src/` 文件。文档和测试不算生产结构证据。
- **deterministic derivation（确定性推导）**：模型只交事实表；full/partial/zero 和分数由 provider 里的固定规则计算。同样的事实表永远得到同样标签和分数。
- **fail closed（失败关闭）**：事实缺失、重复、未知、非布尔、多余字段、证据空泛、源引用不可验证、或模型直接输出标签/分数时，不猜、不给默认分；相同 prompt 重试后仍失败则该样本失败。
- **dimension confusion matrix（维度级混淆矩阵）**：对每个维度统计 expected 标签与 predicted 标签的组合。它回答“每个维度到底认对了没有”，防止总分碰巧分离。
- **blinded pairwise（盲评两两比较）**：把一个正例和一个负例匿名展示给 judge，只允许选择 left/right/tie 并给证据。它是附加诊断，不能修复标签错误或总分失败。

## 期望维度标签矩阵

下表是离线规则测试的源设计标签，不是真实模型结果，也不声明判别力已修复。

| 夹具 | contract | adapter | policy | billing | streaming | query/error | 期望总分 |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| reference | full | full | full | full | full | full | 100 |
| equivalent | full | full | full | full | full | full | 100 |
| anti-pattern | full | zero | zero | full | full | full | 60 |
| docs-present | full | zero | zero | full | full | full | 60 |
| baseline-policy-scatter | full | full | partial | partial | partial | full | 75 |
| public-starter | zero | zero | zero | zero | zero | zero | 0 |

固定权重不变：contract 20、adapter 20、policy 20、billing 20、streaming 10、query/error 10。full 得满分，partial 得半分（向下取整），zero 得 0。因此 baseline-policy-scatter 的正确算式是 `20 + 20 + floor(20/2) + floor(20/2) + floor(10/2) + 10 = 75`。此前写 55 是把 v2-e 的失败观测值误当成新规则期望值，属于文档/测试算术错误；本文件和离线测试已改为 75。没有为凑 55 或 75 修改任何权重或夹具。

docs-present 与 anti-pattern 有意相同：只有生产 `src/` 事实能证明结构存在，文档描述不能替代实现。

## 互斥标签谓词

每个维度声明若干布尔事实，事实角色有三种：

1. `zero_if_false`：核心存在条件。任一为 false，维度直接 zero。
2. `required`：full 必须满足的正向条件。未触发 zero 但有任一 false 时，维度为 partial。
3. `forbidden`：禁止条件。任一为 true，维度直接 zero。

推导顺序固定：

1. 先检查 zero：`forbidden=true` 或 `zero_if_false=false`。
2. 再检查 full：所有 `required=true` 且所有 `forbidden=false`。
3. 若既不是 zero 也不是 full，则为 partial。

因此 full/partial/zero 互斥，且不需要模型给出最终裁决。歧义不是第四种标签；任何无法验证或非法的事实输出都按 malformed 处理并 fail closed。

## 校准与可选 pairwise 口径

真实 v2 校准（尚未授权运行）必须：

1. 每个夹具抽取 3 次结构事实；
2. 保留每次 fact 输出或失败原因，不把失败合成 0 分；
3. 对每个维度生成 expected/predicted 的 3x3 confusion matrix；
4. 同时报告维度标签与固定权重总分；
5. 只有全部 expected 标签正确且总分满足既有分离检查，才可讨论判别力修复；
6. optional blinded pairwise 只能作为二级诊断，赢了也不能修复标签或总分失败。

## 执行边界

本阶段只做离线设计和 stub 测试。尚未调用 candidate model 或 judge model，尚未运行 formal experiment，尚未创建 formal record，尚未升级 suite revision，也未修改 task/starter/oracle/fixtures/threshold。

## 离线实现验证（2026-08-25 更新）

- Fact schema version：`practice-aware-structure-facts/v1`。
- Fact schema SHA-256：`6dd7bb71ad280ba7ba442b6ce2a079c24df0e1d464c1490f488cc1e31096c3e7`。
- 两个易误读的正向事实已重命名：
  - `cross_request_policy_kept_out_of_handler_and_scattered_modules`
  - `billing_ownership_kept_in_policy_or_ledger_boundary`
- 修正 baseline-policy-scatter 期望总分算术：标签矩阵决定的期望值是 75，不是 55。
- `bun test src/benchmark/judge/judge-agent/practice-aware/v2/judge.test.ts`：8 pass / 0 fail。
- `bun test src/benchmark/judge`：99 pass / 0 fail。
- `bun run test:contracts`：224 pass / 0 fail。
- `bun run validate`：workspace layout 与 snapshots 通过。
- `openspec validate llm-provider-gateway-v3-practice-judge --type change --strict`：通过。
- Offline stubs 覆盖期望标签矩阵、总分算术、deterministic points、malformed/unknown/missing/unverifiable fact fail-closed retries、confusion-matrix blocking、blinded pairwise parsing/evaluation、provider v2 wiring，以及与 v1/generic-v2 的 registry 隔离。
- Candidate model calls：0；judge model calls：0；formal experiment/record/suite revision：none。
