## 0. 规划澄清门禁

- [ ] 0.1 在 strict OpenSpec validation 和初始 PR 创建后，与需求方确认首版是否仅限同一
  candidate 的 calibration fixture，并将结论写回 Issue #106、design.md 和本任务清单。
- [ ] 0.2 确认 base/override 声明格式、冲突优先级和删除语义；记录 reject 条件与 canonical
  ordering。
- [ ] 0.3 确认合成树不可变身份与 snapshot v1 resolved 字段的绑定方式，以及 base/override
  变更后的失效证据。
- [ ] 0.4 确认迁移仅限 incubator 的范围，并记录 #97 未合并或已合并时的依赖处理方式。
- [ ] 0.5 确认 calibration driver、materializer、isolate、evaluator 与 snapshot 共同消费的
  resolver 接口及跨消费者相等性断言。

## 1. 版本化合成解析器

- [ ] 1.1 在版本化 kernel 目录实现 repository-local calibration fixture base + overlay
  声明、canonical manifest、tree hash 和严格路径/digest/symlink 校验。
- [ ] 1.2 实现获批的冲突和删除语义，并对缺失 base、digest 不匹配、非法路径、冲突覆盖、循环
  引用和解析顺序稳定性写 focused tests。
- [ ] 1.3 为合成树身份添加 base、declaration、override 与结果哈希绑定，并验证 base 或 override
  改动会 fail closed。

## 2. 消费者与 snapshot 集成

- [ ] 2.1 令 calibration driver/evaluator 从共享解析器获取可执行的私有合成 fixture，且不将其
  写入 agent workspace 或生成物。
- [ ] 2.2 令 kernel materializer 与 isolate 以同一合成 manifest/tree hash 执行和审计，并覆盖
  public 语义和私有质量 probe 一致性。
- [ ] 2.3 将合成 fixture identity 绑定到 snapshot v1 resolved 字段；验证普通 files 清单不包含
  Practice 文本或 `private/practices/` 路径。

## 3. 受限迁移与验证

- [ ] 3.1 在获批的 incubator candidate 中提交版本固定 base 和最小 override，保留完整可复现
  源码，不改 #75、#97 的题面、Practice、source pin、质量门槛或结论。
- [ ] 3.2 为迁移 candidate 重建并复核 snapshot、materialize、isolate、公开语义和私有质量
  calibration，断言所有消费者得到同一合成树。
- [ ] 3.3 执行 public/private 泄露审计、focused tests、`bun run validate` 和 strict OpenSpec
  validation；在 PR 记录结果以及未执行的 Pi、模型、retrieval、盲评与正式 record。
