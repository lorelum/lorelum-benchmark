# Practice Benchmark 维护者指南

本指南为 Practice-injection benchmark candidate 的作者与评审者提供设计边界。
它来自 #75 登录页候选的本地小试经验，目的是让后续候选在设计阶段就能区分"任务要什么""Practice 建议什么"
"自动评测可以把什么设为硬失败或软质量信号"，避免把隐藏的 reference 写法误当成任务要求或 Practice 遵循。

适用对象：所有计划注入 Practice 并测量相关代码质量信号的 benchmark 候选。
本指南不改写 `docs/BENCHMARK_PROTOCOL.md` 的既有协议，只补充 Practice-injection 候选的额外约束。

---

## 一、五类信息

任何候选材料都归入以下五类。混淆类别是 #75 曾踩的主要坑：把 reference 的路径、命名和 helper 当成 Practice 遵循条件。

| 类别 | 可见性与职责 | 是否可决定任务完成 |
| --- | --- | --- |
| 公开任务行为 | `public/` 题面与公开测试中的用户可观察结果、已声明公共接口 | 可以 |
| 注入 Practice | 私有、版本化的通用工程指导：适用场景、建议、理由、anti-pattern | 不单独决定 |
| 私有语义验收 | 对公开任务行为的自动验证（`private/` evaluator） | 可以 |
| 私有质量信号 | 与 Practice 有关、可观察且允许职责等价实现的代码质量证据 | 不可以，单独报告 |
| 实现偏好 | reference 的文件路径、局部 helper、命名、格式或无外部影响的布局 | 不可以 |

### 1. 公开任务行为

题面只描述目标产品行为与任何不可替代的公共接口；不得泄露私有验收或 reference 结构。

- 正例（#75）：题面要求"登录成功显示欢迎、失败显示通用错误、提交期间禁用并防重复提交"，由公开浏览器测试验证。
- 反例：题面写明"必须在 `src/features/auth/loginService.ts` 中实现请求"--这是 reference 布局，属于实现偏好，不应进入公开题面。

### 2. 注入 Practice

Practice 是可迁移的工程指导，经声明的私有运行时通道注入，不进入公开题面或 agent workspace。

- 正例（#75 `react.api.layered-design`）："让组件聚焦交互与展示；通过 feature API 调用远程能力，不直接依赖 HTTP 客户端；在边界处理 DTO 与认证失败翻译。"它描述职责边界与理由，不绑定具体文件名。
- 反例：一张"在组件中调用 `./services/http` 的 `postLogin`"的卡--这把单题 reference 的具体路径和函数名当成了 Practice，不可迁移。

### 3. 私有语义验收

对公开任务行为的自动验证，是任务完成硬门槛。

- 正例（#75）：Playwright 验证欢迎状态、通用错误、禁用与防重复提交，对应题面声明的行为。
- 反例：把"组件不得导入 `services/http`"放进语义验收--这是质量信号而非语义，不应决定任务功能是否完成。

### 4. 私有质量信号

与 Practice 相关、可观察且允许职责等价实现的代码质量证据。它只报告，不影响任务完成状态。

- 正例（#75 `verify-layering.ts`）：检查提交路径 await 一个组件外领域操作、该边界模块负责 transport 与 401 翻译；接受不同命名和目录布局的等价实现。
- 反例：检查"必须存在 `src/services/http.ts` 且导出名为 `postLogin`"--这把实现偏好伪装成质量信号，会拒绝职责等价但命名不同的实现。

### 5. 实现偏好

reference 的文件路径、局部 helper、命名、格式或无外部影响的布局。只作为报告性代码审查信息，不作通过条件。

- 正例：reference 把请求放在 `src/features/auth/loginService.ts`，候选放在 `src/api/login.ts`--只要职责等价就视为相同。
- 反例：因为候选的文件路径或函数名与 reference 不同就判质量信号失败。

---

## 二、Practice 的可迁移写法

### 写法要求

- 卡须含 `id`、`title`、`stage`、`tech_stack`、`applies_when` 与自然语言建议/反模式正文。
- 正文用"建议 + 反模式"说明职责边界与原因，可指定领域边界（如"组件不直接处理 transport"）。
- **不得**以未公开的 candidate 文件路径、函数名、helper 拆分或 reference 代码作为达标条件。
- 不强制完整 Lorelum frontmatter；具体字段格式由 treatment manifest 适配，真实 retrieval 或共享 treatment 引入时再定。

### 正例（#75 `react.api.layered-design`）

```markdown
## 建议
1. 让组件聚焦交互、加载和展示状态；通过 feature API 或领域操作调用远程能力，不直接依赖 HTTP 客户端。
2. 在 API 边界处理请求和响应 DTO，把 API 字段转换成领域结果，不让原始响应对象流入组件状态。
3. 在边界把可预期的传输失败转换成领域错误或领域结果；组件只根据该结果更新界面，不解释状态码。

## 常见反模式
- 在组件中直接调用 `fetch`、axios 或项目的 HTTP adapter。
- 把 API 返回的 DTO 或 response 对象直接存入 UI state。
- 让组件根据 401、500 等传输状态决定业务提示。
```

它描述的是"职责边界"而非具体文件，可迁移到任何 React + 远程 API 场景。

### 反例

```markdown
## 建议
1. 在 `LoginPage.tsx` 中导入 `./services/http` 的 `postLogin`。
2. 新建 `src/features/auth/loginService.ts` 处理请求。
```

这把单题 reference 的具体路径和函数名写成了 Practice，换一个等价实现就会失败，不可迁移。

### 公共接口例外

若特定路径、导出或协议确实属于产品集成合同（例如必须兼容已声明的外部模块路径或导出），维护者**必须将其在公开任务或稳定外部合同中声明**。此时它作为语义验收条件是合理的，但它不是由 Practice 私下补充的要求。

判断标准：该接口是否在公开任务或稳定外部合同中已声明、且对可观察行为不可替代。是 -> 可作硬合同；否 -> 视为实现偏好。

---

## 三、硬门槛与质量信号

### 硬门槛（可使任务失败 / 尝试无效）

- 公开语义测试失败。
- 已声明公共接口不兼容。
- public/private 隔离泄露（private evaluator/oracle/scoring 进入 agent workspace 或公开题面）。
- 生命周期违规（修改已冻结 revision、绕过 snapshot 等）。

### 质量信号（仅报告，不影响任务完成）

- 所有 Practice 相关质量信号，包括 #75 的 API 分层探针。
- 质量信号未观察到时，即使语义通过也仅记为"未观察到对应 Practice 相关质量"，**不得**描述为功能失败或评测失败。
- 质量信号必须映射到 Practice 的建议或 anti-pattern，并接受职责等价实现。

### Practice 观测结果契约

所有当前与未来 Practice-injection candidate 的 evaluator 和结果汇总必须独立保存以下维度；新增或修改 candidate 时，必须在关联 issue 与 OpenSpec 说明如何满足该契约。已冻结 candidate 只能通过新 revision 或独立 change 迁移，绝不回写历史输入或记录。

| 维度 | 允许状态 | 说明 |
| --- | --- | --- |
| 语义结果 | `pass` / `fail` / `not-run` | 仅语义 `pass` 表示任务完成 |
| Practice 观测 | `observed` / `not-observed` / `indeterminate` / `not-run` | 仅报告 Practice 相关职责证据 |
| evaluator/execution health | `evaluated` / `invalid-output` / `execution-failed` / `not-executable` | 表示管线是否产生可用结果，不能从前两项推导 |

- `semantic=pass` 且 `practice_observation=not-observed` 必须表述为任务完成、未观察到对应 Practice 证据；它仍是一次健康的 `evaluated` 结果。
- `not-observed` 只能由已校准且适用于 candidate 的反模式或缺失职责证据产生。
- probe 遇到解析失败、未支持代码形态、依赖缺失或无法可靠分类时，必须报告 `indeterminate` 及稳定审计原因，不能把它伪装成 `not-observed`。
- `joint_pass` 仅可派生为语义 `pass` 与 Practice `observed` 同时成立；它不是任务完成、evaluator health 或加权总分。

### 单次运行的判定标准

一次运行必须同时保留三个彼此独立的问题；任何报告、汇总或退出码都不得用其中一个问题的答案替代另一个。

| 要回答的问题 | 唯一判定依据 | 可以得出的结论 | 不得得出的结论 |
| --- | --- | --- | --- |
| 评测是否产生可用结果？ | `evaluation_status` | 仅 `evaluated` 表示本次评测健康并产出可解释结果 | `semantic=fail`、`not-observed` 或 `indeterminate` 不等于评测失败 |
| Agent 是否完成任务？ | `semantic` | 仅 `pass` 表示通过全部已声明的公开语义验收 | `observed` 不等于任务完成；`not-observed` 不等于任务失败 |
| 是否观察到被测 Practice 的职责证据？ | `practice_observation` | 仅 `observed` 表示在 probe 已声明且已校准的能力范围内观察到该证据 | `not-observed` 仅表示已校准负面证据；`indeterminate` 不表示未遵循 Practice |
| 是否同时满足功能与该质量信号？ | 派生 `joint_pass` | 仅当 `semantic=pass` 且 `practice_observation=observed` 时为真 | 它不是总分、任务完成状态或评测健康状态 |

因此，`semantic=pass`、`practice_observation=not-observed`、`evaluation_status=evaluated` 的正确结论是：**任务完成，未观察到该 Practice 证据，评测正常完成**。它不是“不通过”，也不是“评测失败”。

当 `practice_observation=indeterminate` 时，正确结论是“当前 probe 无法可靠分类”，并保留稳定审计原因；不得将该次运行计入 `not-observed`，也不得据此评价 Agent 是否遵循 Practice。当 `evaluation_status` 不是 `evaluated` 时，语义与 Practice 维度只能保留为 `not-run` 或已有原始值供审计，不能补推为任何通过或未通过结论。

### 禁止的行为

- 把实现偏好（命名、目录、helper 拆分）伪装成任务失败或质量信号失败。
- 用加权总分把语义与质量合并成单一分数--总分会在任务集未稳定时过早冻结权重，并掩盖"功能正确但质量缺失"与"质量出现但功能错误"的不同原因。

### 可自动识别的边界

只有"职责边界"可被自动、稳定地识别为质量信号：

- 组件不直接处理 transport（不直接调用 `fetch`/axios/HTTP adapter、不判断原始响应状态码、不读原始响应体）。
- 提交路径 await 一个组件外的领域操作。
- 该边界模块负责 transport 请求、DTO 转换与认证失败翻译。

文件名、目录路径、helper 拆分和命名**不**作为可自动识别的通过条件。

---

## 四、probe 运行前校准

每个 candidate 的私有质量 probe 必须在任何模型调用前，以固定样例证明其判别力。校准不得调用模型。

### 三类固定样例

| 样例 | 预期语义 | 预期 Practice 观测 | 目的 |
| --- | --- | --- |
| public starter | 通过 | `not-observed` | 证明 baseline 不会被误写为语义失败 |
| reference | 通过 | `observed` | 证明 probe 接受满足职责的实现 |
| 职责等价实现（不同命名/目录/领域结果形式） | 通过 | `observed` | 证明 probe 不把实现偏好当失败 |
| anti-pattern 或已知绕过 | 通过 | `not-observed` | 证明 probe 能拒绝注册的反模式 |

若无法为某项断言构造职责等价通过样例，维护者必须把该断言**降为报告性证据**，或将其**提升为公开合同**并解释原因；不得直接作为质量失败条件。

### #75 的 7 项校准（参照）

`private/calibration.md` 固定了 7 项校准，禁止跳过：

1. naive starter 通过公开语义但**失败**于分层探针（证明 baseline 预期失败）。
2. "导入但不调用 login、提交时本地实现"的绕过**失败**（`unused-login-import`）。
3. "无关路径调用 login、提交时本地实现"的绕过**失败**（`detached-login-call`）。
4. reference 通过同一公开语义。
5. reference 通过分层探针。
6. 职责等价实现（`equivalent-auth-boundary`，不同命名和目录布局）通过探针。
7. （合并自上）若第 2-7 任一项不符合预期，候选必须拒绝，不能进入比较。

校准样例、probe 和断言必须保持 private；候选源、probe 或 Practice 修改后必须重新校准并更新 snapshot。

---

## 五、人可读原始结果表

每个本地或候选对照结果必须按下表呈现，禁止用隐藏加权分数或产品结论代替。

### 模板

| 条件 | 注入内容 | 计划运行 | `evaluated` | 非健康评测 | 语义通过 | Practice 已观察 | Practice 未观察 | Practice 不确定 | 两者同时通过 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 无 Practice 基线 | 无 | 2 | 2/2 | 0/2 | 2/2 | 0/2 | 2/2 | 0/2 | 0/2 |
| 相关 Oracle Practice | React API 分层设计 | 2 | 2/2 | 0/2 | 2/2 | 2/2 | 0/2 | 0/2 | 2/2 |
| 无关 Practice 对照 | React 身份列表呈现 | 2 | 2/2 | 0/2 | 2/2 | 0/2 | 2/2 | 0/2 | 0/2 |

### 每个 `x/y` 的含义

- **分子 x**：该条件下通过该维度的运行次数。
- **分母 y**：该条件总运行次数。
- **语义通过**：该次运行通过全部公开语义测试（登录成功显示欢迎、失败显示通用错误、提交期间禁用并防重复提交）。
- **Practice 已观察**：该次运行的私有 probe 在其声明能力范围内观察到对应职责。
- **Practice 未观察**：该次运行有已校准的负面证据；它不表示任务失败。
- **Practice 不确定**：probe 不能可靠分类，必须保留审计原因；它不表示 Agent 未遵循 Practice。
- **两者同时通过**：该次运行同时满足语义与质量信号--这是判断 Practice 是否带来方向性改善的依据。
- **`evaluated` / 非健康评测**：前者是产生有效结构化结果的次数；后者分别列出 `invalid-output`、`execution-failed` 与 `not-executable` 的次数和原因。所有 `x/y` 的分母保留计划运行次数；非健康评测不得静默从分母剔除、改记为 `not-observed`，或计作任何通过/观测分子。

### 报告要求

- 分别呈现语义通过、Practice 已观察、Practice 未观察、Practice 不确定、evaluator/execution health 与两者同时通过，不合并为总分。
- 结论只能描述已执行的 candidate、Practice、模型与条件；每个条件都必须同时报告计划次数、`evaluated` 次数和全部非健康状态，不能选择性排除运行。
- 只有当所有条件均完成预先声明的重复次数、全部运行均为 `evaluated`、probe 校准通过、且相关 Practice 的语义通过次数不低于 baseline 与无关对照并且其“两者同时通过”次数严格领先二者时，才可称为**该 candidate 在该执行条件下的方向性信号**。
- 即使满足上述条件，结论也只能说明该条件下的原始结果差异；它不证明 retrieval 有效、Practice 的因果效果、正式 benchmark 结果、产品效果或普遍模型能力。任一条件出现非健康评测、未完成计划次数或未通过校准时，只能报告诊断结果，不得作条件比较结论。

---

## 六、#75 probe 断言分类矩阵

覆盖 `verify-layering.ts` 全部七条断言，映射到五类信息。

| 断言 | 来源 | 分类 | 说明 |
| --- | --- | --- | --- |
| 组件不得直接导入 `services/http` | `verify-layering.ts` | 私有质量信号（职责边界），仅报告 | 检查"组件不依赖 HTTP adapter"这一职责；`services/http` 路径本身是实现偏好，不作通过条件 |
| 组件不得直接调用 `postLogin`/`fetch`/`axios` | 同上 | 私有质量信号（职责边界），仅报告 | 检查组件不直接发起 transport；`postLogin` 命名是实现偏好 |
| 组件不得判断 `response.status`/读 `response.body` | 同上 | 私有质量信号（职责边界），仅报告 | 检查组件不处理原始传输细节 |
| 每个提交路径须 await 一个组件外领域操作 | 同上 | 私有质量信号（职责边界），仅报告 | 检查职责分层：提交路径委托给边界模块 |
| 边界模块须负责实际 transport 请求 | 同上 | 私有质量信号（职责边界），仅报告 | 检查边界模块确实承担 transport 职责 |
| 边界模块须把 401 转换为领域错误/领域结果 | 同上 | 私有质量信号（职责边界），仅报告 | 检查认证失败在边界翻译为领域语义 |
| 边界模块不得把原始 response/body 返回组件 | 同上 | 私有质量信号（职责边界），仅报告 | 检查原始传输对象不流入组件 |

另附语义验收（可决定任务完成）：

| 断言 | 来源 | 分类 |
| --- | --- | --- |
| 正确凭证显示欢迎状态 | `login.spec.ts` / `oracle.yaml` | 私有语义验收（硬门槛） |
| 错误凭证显示通用认证错误 | 同上 | 私有语义验收（硬门槛） |
| 提交期间禁用控件且拒绝重复提交 | 同上 | 私有语义验收（硬门槛） |

矩阵要点：七条质量断言全部归为"私有质量信号、仅报告"，没有任何一条把未公开的 reference 路径、helper 或命名列为硬门槛。`services/http`、`postLogin` 等标识符在探针中仅用于检测职责边界，不作为通过条件的一部分。

---

## 七、小样本结论边界

#75 的每条件两次本地结果只是一题本地方向性信号。

- **不**证明真实 Lorelum retrieval 有效。
- **不**证明产品效果。
- **不**证明模型泛化能力。
- **不**表明团队 Practice 已被证明有效。

它只说明：在该 candidate、该 Practice、该模型与该条件下，相关 Practice 在两次运行中同时满足登录语义与 API 分层质量信号，并严格领先 baseline 与无关对照。任何更宽的结论都需要更多任务、模型、重复次数和正式 record 支撑，且必须通过独立 issue 与 OpenSpec change 承接。

---

## 八、人工审阅

本指南不强制人工审阅。各 candidate 自行决定哪些信号需要人工补充而非自动 probe；人工审阅不是当前小试的前置条件。若某 candidate 引入人工审阅，须在 candidate 设计中声明审阅范围、标准与记录方式，且不得用人工审阅把实现偏好升级为硬门槛。
