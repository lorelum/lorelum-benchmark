# Treatments（实验处理）

treatment 描述施加给 Agent 的实验条件：基线或外部 Skill。每个可复用 treatment 都有
版本化目录和 manifest；修改 prompt、注入或工具时必须创建新版本。

Pi v2 从 `treatments/<id>/v<version>/treatment.yaml` 解析 treatment，并核对请求的
`id`、`version` 和 `tool_policy_hash`。`baseline/v1` 是不注入额外内容的最小可执行条件；
Skill treatment 必须保存固定的 agent-visible material、来源 revision 和内容 hash，由 adapter
以 Pi `--skill` 注入，而不是依赖运行时下载或自动发现。

## Practice delivery

声明为 treatment 的版本化 Practice 只能按 condition-scoped contract 交付，且不得将 evaluator、
oracle 或 scoring material 复制到 agent workspace、模型输入、公开题面、starter、trace 或日志。

- `practice-card`：Practice 由私有运行时通道注入对应模型输入；不得物化到 agent workspace 或
  公开 task prompt。
- `project-convention`（`project-convention/v1`）：仅可将声明的 treatment 文本物化为 agent
  workspace 中的项目内部规范文件（例如 `docs/frontend-guide.md`）。该文件不得包含 evaluator、
  oracle 或 scoring material；baseline 和任何未声明该 treatment 的条件不得拥有该文件；公开
  trace 和日志只能记录 treatment version 与 hash。

`project-convention` 物化的是 agent-visible treatment content，不是 private benchmark material；
其条件隔离与 version/hash 识别仍是 delivery contract 的一部分。
