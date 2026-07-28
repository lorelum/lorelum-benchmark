## 0. 规划澄清门禁

- [x] 0.1 确认 v2 的 canonical 形式边界：纯 Merkle 树根摘要 + 按需内存诊断；不持久化完整逐文件
  清单或 proof。写回 Issue #107、design 与本清单。
- [x] 0.2 确认 v2 首版适用范围：incubator candidate 与新创建（无运行记录）的非冻结 suite revision；
  冻结/退休 revision 一律不迁移。
- [x] 0.3 确认 v1/v2 并存、选择、迁移与验证策略：由 version 字段决定路径，无隐式迁移，v1 冻结
  不再演进，不重写冻结/退休 v1 snapshot 或正式 record。
- [x] 0.4 确认与 #106 overlay resolver 的依赖顺序：PR #108 已合并到 origin/main，v2 基于最新主线
  实现，自然复用 calibration_sets_hash 绑定，无需独立等待或分支耦合。
- [x] 0.5 确认 canonical path、字节、文件类型、目录、symlink、非法路径与 generated-output 排除规则：
  叶节点 ``路径\0SHA256`` 字典序 + Merkle 树根，目录不作为独立节点，排除清单与 v1 完全一致。
- [x] 0.6 确认 profile input hash、source pin、Practice/private payload 边界：复用 v1 resolved
  绑定字段，诊断仅输出受影响路径与失配类型，不泄露私有内容。

## 1. canonicalization 与 v2 schema

- [x] 1.1 实现版本化的 canonical 树身份：路径规范化、字典序排序、常规文件过滤、字节级 SHA-256、
  Merkle 式树根摘要与稳定编码。
- [x] 1.2 实现 generated-output 排除、证据索引排除、snapshot 自身排除，以及 injection-calibration/v1
  的 ``private/practices/`` 排除，与 v1 一致。
- [x] 1.3 为非法路径、symbolic link、错误 schema、内容变更、新增、删除与重命名写 focused tests，
  断言均 fail closed。

## 2. v1/v2 并存与验证路径

- [x] 2.1 在 snapshot 生成与验证中按 ``version`` 字段选择 v1 或 v2 路径；v1 行为保持不变。
- [x] 2.2 实现 v2 的 resolved 绑定（core 版本/hash、profile、materializer_kind、input hash、
  materialized output hash、profile input hash、calibration sets hash），复用 v1 绑定。
- [x] 2.3 实现受控失配诊断，仅暴露受影响受管路径与失配类型，不泄露私有内容。
- [x] 2.4 为 v1/v2 并行读写与验证、跨干净目录稳定性、source/profile input 变化失效写 focused tests。

## 3. 验证与审计

- [x] 3.1 执行 public/private 泄露审计：断言 v2 普通文件树、身份与诊断不包含 Practice 文本、
  ``private/practices/`` 路径或私有 evaluator/oracle。
- [x] 3.2 执行 focused snapshot tests、``bun run validate``、OpenSpec strict validation 与
  ``git diff --check``；记录结果与未执行项。
- [x] 3.3 不执行 Pi、模型、retrieval、盲评或正式 record；不将 candidate 升级为 suite revision。