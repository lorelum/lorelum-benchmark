## 0. 规划澄清门禁

- [x] 0.1 确认首版使用全局版本化 registry；新 candidate 可复用兼容 kernel/profile base，
  同一 candidate 的 Practice 扩展新增 versioned calibration set，并写回 Issue #106、design 与本清单。
- [x] 0.2 确认 `base.ref + sha256`、`extends` 与 `overlay.path + sha256` 声明；overlay 仅新增或
  替换同路径文件、不支持删除，路径/digest/symlink/循环一律 fail closed。
- [x] 0.3 确认 snapshot v1 以 `resolved.calibration_sets_hash` 聚合全部 set 的 canonical identity；
  base、overlay、声明或合成树变化均使验证失效。
- [x] 0.4 确认迁移仅限 incubator，#97 已合并且作为不可改写基线；不修改其 source pin、Practice、
  题面、质量门槛或结论。
- [x] 0.5 确认 calibration driver/evaluator 通过 kernel 临时私有 staging 消费 resolver 输出；
  materialize、isolate、snapshot 与 hash 使用同一 manifest/tree hash。

## 1. 版本化合成解析器

- [x] 1.1 在版本化 kernel 目录实现 repository-local calibration fixture base + overlay
  声明、canonical manifest、tree hash 和严格路径/digest/symlink 校验。
- [x] 1.2 实现获批的冲突和删除语义，并对缺失 base、digest 不匹配、非法路径、冲突覆盖、循环
  引用和解析顺序稳定性写 focused tests。
- [x] 1.3 为合成树身份添加 base、declaration、override 与结果哈希绑定，并验证 base 或 override
  改动会 fail closed。

## 2. 消费者与 snapshot 集成

- [x] 2.1 令 calibration driver/evaluator 从共享解析器获取可执行的私有合成 fixture，且不将其
  写入 agent workspace 或生成物。
- [x] 2.2 令 kernel materializer 与 isolate 以同一合成 manifest/tree hash 执行和审计，并覆盖
  public 语义和私有质量 probe 一致性。
- [x] 2.3 将合成 fixture identity 绑定到 snapshot v1 resolved 字段；验证普通 files 清单不包含
  Practice 文本或 `private/practices/` 路径。

## 3. 受限迁移与验证

- [x] 3.1 在获批的 incubator candidate 中提交版本固定 base 和最小 override，保留完整可复现
  源码，不改 #75、#97 的题面、Practice、source pin、质量门槛或结论。
- [x] 3.2 为迁移 candidate 重建并复核 snapshot、materialize、isolate、公开语义和私有质量
  calibration，断言所有消费者得到同一合成树。
- [x] 3.3 执行 public/private 泄露审计、focused tests、`bun run validate` 和 strict OpenSpec
  validation；`bun run validate` 已执行但被预先存在的忽略 `node_modules`/`dist` 阻断，未清理
  用户生成物；在 PR 记录结果以及未执行的 Pi、模型、retrieval、盲评与正式 record。
- [x] 3.4 修复 review 发现的 clean-checkout 依赖：将 public starter 与 TypeScript parser 安装
  到 kernel 私有 staging，验证 driver/evaluator 不再写入 candidate source tree。
