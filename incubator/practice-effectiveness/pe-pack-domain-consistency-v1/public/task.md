# 在发布前检查本地 pack 的 domain 一致性

本地发布工具读取 pack 清单和 entrypoint 事实，生成发布索引。当前实现只保留合法样本的 happy path。

请完成 `src/publish-check.ts`，且不要修改导出接口或 CLI 输出结构。

- 合法 pack 必须生成兼容索引。
- 缺失或重复 pack、缺失 entrypoint、entrypoint domain 或 export 不一致、以及缺失或跨 domain
  不兼容的依赖，都必须阻止发布。
- 被拒绝时返回稳定的结构化诊断，包含 pack、字段路径与类别，并累计独立问题。
- 重排 pack、entrypoint 和依赖输入不能改变规范化结果。
- 不得联网、安装依赖或执行任意 pack 代码。

使用 `bun test` 运行本地合法样本。隐藏发布检查会覆盖多 pack 组合。
