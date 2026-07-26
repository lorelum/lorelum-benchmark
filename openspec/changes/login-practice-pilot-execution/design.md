## Context

Issue #75 承接 #73 的登录页 Practice candidate 与 #77 的校准修复。`incubator/practice-injection/login-page-layered-api-v1/` 仍是没有 run record 的 `candidate`：公开 starter 已通过浏览器语义校准，私有 reference 已通过语义和 AST 分层探针，naive starter 与两种已知绕过实现会被分层探针拒绝。

candidate 的 `private/conditions.yaml` 已声明 baseline、Oracle Practice、无关 Practice 各两次，且将 `lorelum-retrieval` 标为 unavailable；它还声明了模型标识、预算、干净工作区和私有条件注入通道。该声明不是执行授权，也没有提供以下必要信息：实际可用的非正式编码代理调用路径与不可变模型版本、可写且启用不可变保留的 artifact storage、盲评执行者与匿名映射的受限位置。

当前 `pi/v2` 面向冻结的 suite 任务和 formal environment。它不应被用来绕过 candidate 的非正式执行边界；本 change 在负责人确认前不实现或调用任何执行路径。

## Goals / Non-Goals

**Goals:**

- 为 #75 的六次最小人工小试建立明确的执行授权、排除条件和证据保留契约。
- 保证各有效尝试只因声明的 condition-scoped Practice 注入而不同，且 agent workspace 仅含 `public/task.md` 与 `public/starter/`。
- 将语义检查、AST 分层探针和盲评分开记录，以原始双通过次数作出仅限诊断性的预注册判断。
- 在执行前将模型、提示、预算、工具策略、candidate snapshot、环境和 Practice hash 固定为可核验输入。

**Non-Goals:**

- 不改写 #73/#77 的归档 artifacts、candidate 的公开题面或 starter。
- 不执行模型调用、真实检索、盲评或正式 record；也不将 candidate 晋升到 suite revision。
- 不修改活跃 Pi runner、treatment、environment、schema 或 formal experiment plan。
- 不用盲评或加权总分掩盖语义或分层探针失败。

## Decisions

### 1. 负责人确认是执行实现的前置门禁

严格 OpenSpec validation 与初始 PR 只能证明流程 artifacts 形式完整，不能替代研究判断。初始 PR 创建后，必须由负责人确认可观察行为、Practice 行为、baseline 缺陷与区分度、相关/无关 Practice 对照、私有验收、candidate 与 source snapshot、模型/提示/预算和盲评边界，并把回答写回 #75 及本 change 的 `design.md` 和 `tasks.md`。

替代方案是由已有 `conditions.yaml` 自动补齐未声明的细节。该方案会把执行路径、模型版本和 storage 策略等研究变量当作实现细节，因此被拒绝。

### 2. 三个已声明条件各执行两次，检索保持不可用

仅 baseline、Oracle Practice、无关 Practice 各进行两次。每次有效尝试复核同一 candidate snapshot、公共输入 hash、系统 prompt hash、工具策略 hash、模型与预算；Oracle 与无关卡仅从私有 condition-scoped runtime channel 注入。`lorelum-retrieval` 没有可复现输入契约，必须保持 unavailable，不能作为空白或临时条件执行。

两次重复只用于发现注入、评测和方差问题，无法支撑显著性或发布结论。增加条件、次数或恢复检索均会改变 #75 的解释范围，必须另行确认并修订本 change。

### 3. 私有材料永不进入 agent workspace 或公开 trace

每个尝试创建新的工作区，只复制 `public/task.md` 与 `public/starter/`。private Practice 只能通过对应条件的运行时通道提供；oracle、evaluator、snapshot、盲评映射与其他 private 内容在 agent 结束后才由执行者使用。公开 trace 和日志仅可记录 Practice 的版本与 hash，不能记录正文、oracle 或私有评分配置。

以共享工作区或把 Practice 写入 prompt/task 文件来简化人工执行会破坏条件隔离，故不采用。

### 4. artifact 先存储并核验，后判定尝试有效

每次尝试开始前，执行方必须确认受保护 storage 的 URI、写入身份、版本化和不可变保留策略。尝试结束后必须保存提示输入、执行 trace/输出、候选 diff、语义/探针输出、环境信息、成本、时延、重试与有效性状态；每项 artifact 必须具备可复核 URI 和 SHA-256。仓库的 `private/evidence-index/` 只登记 execution snapshot、condition、artifact URI/SHA-256 和盲评映射的受限位置，不提交 prompt、trace、日志或 diff。

缺少 storage 或任一 artifact 的不可变保留核验时，尝试无效且不计入条件比较。把产物临时留在本地或提交到仓库无法提供所需的访问边界和不可变性。

### 5. 评测与盲评独立，报告只保留原始观察

每个有效尝试必须分别运行公开浏览器语义检查和私有 AST 分层探针。随机化、脱敏后的材料交给无上下文盲评者，以相关性/利用率双轴量表评审；condition 映射放在受限位置。决策指标仅为“语义与分层探针均通过”的尝试次数：Oracle 必须严格高于 baseline 与无关 Practice，才可支持继续以新的 change 探索；否则报告为诊断性或不确定。

盲评不能替代自动验收，自动验收也不应暴露 condition；将二者合并为总分会掩盖失败维度，因此不采用。

## Risks / Trade-offs

- [非正式编码代理无法提供不可变模型版本或可审计 trace] -> 不开始执行；将缺口写回 #75，另行选择或实现合规路径。
- [artifact storage 未启用不可变保留或写入权限不足] -> 不运行，不能以本地文件、Git commit 或普通对象存储替代。
- [Practice/oracle/private evaluator 泄露到 workspace 或公开 trace] -> 立即判定尝试无效，停止同批次执行并完成泄露审计。
- [两次重复产生偶然差异] -> 只报告原始结果和异常，不作显著性或普遍有效性结论。
- [盲评者可以从材料推断 condition] -> 重新制作脱敏包；无法消除时将盲评标为无效，不用其支撑解释。

## Migration Plan

1. 严格验证本 change，并在 `codex/login-practice-pilot-execution` 建立只含 OpenSpec artifacts 与必要流程规则的初始 PR，关联 #75。
2. 在该 PR 上完成负责人规划澄清，将确认答案写回 #75、`design.md` 与 `tasks.md`；未解决的问题保持实现门禁。
3. 仅在所有门禁通过后，于同一分支和 PR 中实现经确认的 candidate 私有执行治理、泄露审计、artifact index 与必要的验证；重新生成受影响 snapshot，并运行相应校验。
4. 每次执行前后按本 design 核验输入、workspace、artifact 与评测。任何无效尝试不产生正式 record，也不计入比较。
5. 小试结束后只提交允许入库的 evidence index；由负责人决定修订、扩展或停止，任何后续范围使用新的 OpenSpec change。

## Open Questions

以下问题必须由负责人确认并写回 #75 后才能实现或执行：

1. 可用的非正式编码代理调用路径、代理与提供商模型的不可变版本标识、采样参数，以及谁持有调用授权。
2. 受保护 artifact storage 的 URI、写入身份、版本化/不可变保留核验方法和保留期限。
3. 盲评执行者、脱敏材料的允许范围、匿名映射的受限位置，以及出现分歧时的处理方式。
4. `conditions.yaml` 中既有模型标识、系统 prompt、工具策略、source commit 与 snapshot 是否仍为本次小试的批准输入；若否，批准的替代值及其 hash 是什么。
5. 执行停止条件：发生一项无效尝试时是停止整个小试、补跑同一 condition，还是只记录后停止比较；补跑是否仍受每条件两次限制。
