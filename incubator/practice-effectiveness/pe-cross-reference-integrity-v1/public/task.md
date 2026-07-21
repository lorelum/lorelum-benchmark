# 在发布前检查本地 registry 引用

本地发布工具读取 `fixtures/registry.json` 和 `fixtures/entries/` 中的条目文件，生成
供发布流程消费的索引。当前实现只覆盖了提供的合法样本。

完成 `src/registry-check.ts`，且不要修改其导出接口或 CLI 输出结构。保留兼容索引，并让
发布消费者能够处理无效的本地关系。实现必须保持本地、确定的工作边界：不得访问网络、
系统时间或修改输入值。

使用 `bun test` 运行本地样本检查。额外的发布 fixtures 会覆盖跨文件关系与兼容性边界。
