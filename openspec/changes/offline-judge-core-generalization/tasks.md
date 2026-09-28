## 1. Plan Gate

- [x] 1.1 在初始 OpenSpec PR 和 strict validation 完成后、任何实现代码前进入 Plan mode（客户端不支持时使用等效规划阶段），确认本 change 的范围、非目标、预期效果、验证方式和 issue #225 一致。
- [x] 1.2 在 Plan mode 固定 `<=3B` 模型 artifact、量化、tokenizer、runtime、上下文/temperature/seed、本地启动方式、Windows CUDA 兼容性和离线边界；未确认前不下载模型、不写运行代码。
- [x] 1.3 在 Plan mode 固定 Gateway v3、Source-authority 和 Compaction holdout 的材料、public/private 边界、labels、最小样本和 success thresholds；材料不足时明确 `holdout-not-ready` 规则。
- [x] 1.4 在 Plan mode 固定原型路径、私有 calibration/report 位置、core/prompt zero-diff 文件集合、允许的 holdout diff 和结论解释；将答案回写 issue、design.md 与 tasks.md 后再开始实现。
- [x] 1.5 明确列出会改变评测语义的决定与纯工程决定；确认模型或 runtime 变化会建立新实验 identity，而不是沿用旧 holdout 通过结论。

## 2. Prototype Contract And Deterministic Core

- [x] 2.1 创建 `src/benchmark/judge/offline-core/v1/` 原型骨架，定义场景 profile、归一化 evidence、rubric、pair case、verdict、abstain、provenance 和 report 的私有版本化 sidecar types；不修改公共 schema 或 `judge-result/v1`。
- [x] 2.2 实现 scenario 目录加载与结构校验；CLI 通过显式目录接收场景，不建立会随 holdout 增长的中央 registry 或场景专用分支。
- [x] 2.3 实现确定性 evidence projection、稳定 id、hash、token 预算和 public/private 边界校验；私有路径、oracle、condition、labels、Practice 或 calibration material 在模型调用前 fail closed。
- [x] 2.4 实现 core-owned 系统 prompt 主体和输出协议：只允许 `supports | contradicts | insufficient`、`A | B | tie | insufficient` 以及诊断用 `low | medium | high` confidence；scenario rubric 只作为数据输入，不覆盖 decision mapping。
- [x] 2.5 实现本地 runtime adapter 和显式 CLI：只连接已启动的 loopback/local 模型，校验 model artifact hash 和固定参数；不得下载、访问远端或静默降级。
- [x] 2.6 实现确定性 schema 校验、evidence citation 校验、冲突检查、fail-closed、abstain、无权重聚合和逐 decision provenance；非法输出不得写成低分。
- [x] 2.7 添加不需要真实模型的 contract tests，覆盖合法 verdict、非法 verdict、未知 evidence id、insufficient、冲突、缺失 artifact、远端端点拒绝、私有材料拒绝和 core/prompt hash 稳定性。

## 3. Development Scenarios

- [x] 3.1 为 Gateway v3 新增 scenario profile、evidence adapter、固定 rubric、private calibration pairs 和 labels，复用现有 reference/equivalent/anti-pattern/naming-variant 材料但不修改原任务或冻结 judge。
- [x] 3.2 为 Source-authority 新增第二个 scenario profile、adapter、受控私有 policy rubric、calibration pairs 和 labels，验证 rubric 来源变化不要求 core 改动。
- [x] 3.3 添加只读固定任务 rubric 的适配测试，确认原型不重写 `generic/v1/v2`、`async-report-replan/v1` 或其他既有 rubric，也不改变语义硬门槛。
- [x] 3.4 显式运行两个开发场景的本地校准，分别记录 pairwise accuracy、等价对稳定性、A/B 顺序一致性、abstain、evidence reference validity、schema validity、high-confidence errors、失败样例和 usage/runtime identity。
- [x] 3.5 在 holdout 前冻结并记录 core、system prompt、输出协议、模型 artifact、runtime、schema、decision mapping、aggregation 和 thresholds hash；若任一开发场景不通过，按预先规则记录失败或 `indeterminate`，不得通过改 prompt 隐藏。
  - 结果：两个开发场景均未通过（Gateway v3 decisive 0/16，Source-authority v2 decisive 1/16）。失败按原样保留，未据此回调 prompt 或阈值。原始结果见 `src/benchmark/judge/offline-core/v1/private/runs/`。

## 4. Holdout And Generalization Evidence

- [x] 4.1 按 Plan mode 已固定的最小 fixture 和 labels 加入 Compaction 摘要 holdout；若材料不足，提交 `holdout-not-ready` 记录且不替换场景。
- [x] 4.2 加入 holdout 时只新增允许的 scenario profile、evidence adapter、rubric 和 labels；对 core、system prompt 主体、输出协议、decision mapping 和 aggregation 执行 zero-diff 检查并保存证据。
- [x] 4.3 在冻结后显式运行一次本地 holdout，保存原始 outputs、逐 case verdict、citations、abstain、高置信错误、metrics 和冻结/实际 hash；不得根据结果反向调 prompt 或 labels。
- [x] 4.4 校验 holdout 是否满足预声明 thresholds；未满足时按失败或不确定记录，不合并 dev/holdout 分数，不宣称通用性。
  - 结果：holdout 未通过（decisive 0/8，schema validity 62.5%，order consistency 25%）。结论为通用性断言未获支持。
- [x] 4.5 添加 negative controls，覆盖 A/B 顺序交换、等价 pair、命名碰撞、不同目录布局、缺失证据、非法输出、模型不可用、私有 marker 泄漏和场景词提示依赖。

## 5. Report, Audit, And Closeout

- [x] 5.1 生成 generalization report，包含 claim、dev/holdout 原始结果、逐场景状态、失败/abstain 样例、adapter diff 范围、core/prompt zero-diff 证据、模型/runtime identity、阈值和未解决问题。
- [x] 5.2 审计 report、prompt、fixtures、logs 和 artifacts，确认私有 labels/oracle/condition/calibration/Practice 未进入模型输入或 agent workspace；模型权重未入库。
- [x] 5.3 运行聚焦 contract tests、`bun run validate`、`bun x openspec validate offline-judge-core-generalization --type change --strict --json` 和适用泄露审计；记录命令结果与未执行原因。
- [x] 5.4 回读 issue #225、PR 正文和重要评论，更新实际交付、验证证据、失败/不确定边界和下一步；不创建正式 record、不升级 suite/candidate、不接入 P1/Pi runner。
- [ ] 5.5 若通用性结论通过，另开后续问题评估 #209、公共 provider/schema 或 runner 集成；本 change 不预先承诺迁移。
  - 状态：通用性结论未通过，此任务不适用；本 change 不开启后续集成。
