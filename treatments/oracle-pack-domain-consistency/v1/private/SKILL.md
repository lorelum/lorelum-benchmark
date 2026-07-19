---
name: check-pack-domain-consistency
description: Check local pack ownership and dependency consistency before publication.
metadata:
  version: v1
  source: contract-derived-seed
---

# 在本地发布前检查 pack 归属与依赖一致性

- **Practice ID：** `check-pack-domain-consistency`
- **状态：** `frozen-for-pilot`
- **适用范围：** 组合已声明 pack、归属 domain、entrypoint、export 与跨 pack 依赖的本地发布或构建工具。
- **工具边界：** 仅使用任务的常规本地工作区；不需要网络访问、安装包、执行代码、外部服务或额外权限。

## 目的

将 pack 声明视为关于归属与兼容性的发布期主张，且必须与本地源码事实一致。成功结果仅接纳
声明的 domain、entrypoint、export 和依赖符合已评审 contract 的 pack；拒绝结果则在生成任何
可发布索引前记录每个可独立发现的不一致。

## 何时适用

- 为构建或发布步骤准备本地 pack、模块、扩展或 bundle 集合。
- 解析其兼容性受已声明归属 domain 约束的 entrypoint 和依赖。
- 生成下游工具会当作权威本地包视图的索引或报告。

## 步骤

1. 检查 pack 前建立发布 contract：明确 pack 标识规则、domain 归属规则、entrypoint 成员资格、允许的 export 及允许的依赖方向。
2. 在加载边界记录每个声明，不得静默覆盖先前事实。为每个本地输入保留 pack 标识、声明 domain、entrypoint 主张、export 事实、依赖主张和来源坐标。
3. 针对完整本地事实集解析每个已声明 pack 和依赖目标。在提出依赖的声明处报告缺失目标；不得猜测可选关系或下载替代物。
4. 将每个声明 entrypoint 与标识其归属 domain 和可用 export 的源码事实相比较。声明与本地源码不一致时，记录归属或 export 不一致。
5. 依据已评审的 domain 兼容 contract 评估每个已解析依赖。即使两个 pack 及其 entrypoint 分别存在，只要依赖不兼容也要报告。
6. 将声明事实与派生的发布记录分开保存，使冲突的标识、domain 或 entrypoint 主张仍可供审阅，而不会被键值 map 或最后一次写入隐藏。
7. 在结构化诊断中累计独立不一致。保留稳定类别、受影响 pack 或关系及来源坐标；仅对重复读取同一事实导致的完全重复项去重。
8. 在返回诊断或构建索引前，为 pack、关系、类别与来源坐标定义规范顺序。不得依赖目录发现、manifest 枚举或依赖遍历顺序。
9. 仅在完整一致性检查未发现问题后生成可发布索引。拒绝时返回完整且有序的诊断，且不返回可被当作权威的部分索引。

## 验证

- 声明的 domain、entrypoint、export 和允许依赖均一致的本地 pack 集合生成兼容的发布结果。
- 分别针对缺失依赖、位于声明 domain 外的 entrypoint、export 不匹配和不兼容依赖的探针都会阻止发布，并保留来源坐标。
- 包含组合无效情况的集合返回全部可独立发现的不一致，不会通过覆盖隐藏较早主张，也不会构造部分索引。
- 重排等价的 pack 声明、export 和依赖列表后，规范化诊断集合及成功输出保持不变。

## 不应做什么

- 将 manifest 存在本身当作其声明的 domain、entrypoint 和导出源码一致的证明。
- 为判定本地一致性而加载、执行、下载或以其他方式信任任意依赖代码。
- 未经已评审 contract 就猜测缺失依赖是可选的，或猜测跨 domain 关系被允许。
- 只报告第一个 pack 失败、丢弃来源上下文，或从文件系统或图遍历继承输出顺序。

## 来源与限制

这是供 `pe-pack-domain-consistency-v1` 审阅的 `contract-derived seed`，并非既有的
Lorelum pack 或 domain 规范。仓库目前没有正式归属映射、entrypoint 成员规则、export
contract 或跨 domain 依赖政策；任何后续 Practice 或任务冻结前，都必须单独评审这些细节。
