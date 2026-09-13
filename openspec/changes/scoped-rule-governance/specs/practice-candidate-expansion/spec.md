## REMOVED Requirements

### Requirement: 新 candidate 必须通过规划澄清门禁
**Reason**: 该 requirement 将 #89 candidate 的 Planning Gate、三条件和当时的实验输入提升为现行稳定能力。通用 Plan-mode 与适用性规则由 `openspec-pr-continuity` 承接；仅在声明 Practice-effectiveness 时适用的对照方法由 `practice-benchmark-boundaries` 承接。

**Migration**: #89 的具体决策继续保留在 `openspec/changes/archive/2026-07-28-practice-candidate-expansion/`；未来 change 在自身 design 中声明当前 candidate 的适用设计决定。

### Requirement: 每个扩展 candidate 保持隔离且可校准
**Reason**: 该 requirement 将 #89 的 `injection-calibration/v1`、React/Vite、目录、profile-input hash 和三条件实现细节提升为未来 candidate 的稳定默认。public/private 隔离、质量 probe 校准与条件化 Practice 的通用边界已有专属稳定能力承接。

**Migration**: 当前 #89 fixture 和其归档 change 保持不变。未来 candidate 只在其被采用的领域能力与当前 change design 中声明 runtime/profile、目录和校准实现。

### Requirement: 扩展 candidate 不得产生执行结论
**Reason**: 该 requirement 绑定 #89 与 #94/#90/#91 的历史交接。正式 record、结论和生命周期限制由现有 outcome/lifecycle contracts 承接，不应由已经无活跃引用的历史 capability 继续定义。

**Migration**: 已归档 change 继续记录 #89 的执行限制；未来 execution change 依据当前 OpenSpec 与正式运行门禁处理。
