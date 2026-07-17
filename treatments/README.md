# Treatments（实验处理）

treatment 描述施加给 Agent 的实验条件：基线、Oracle Practice、外部 Skill、Lorelum
检索或对照组。每个可复用 treatment 都有版本化目录和 manifest；修改 prompt、注入、
检索或工具时必须创建新版本。

Pi v2 从 `treatments/<id>/v<version>/treatment.yaml` 解析 treatment，并核对请求的
`id`、`version` 和 `tool_policy_hash`。`baseline/v1` 是不注入额外内容的最小可执行条件。
