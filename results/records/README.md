# Run Records（运行记录）

每次正式运行提交一份不可变记录。记录必须固定 suite、case、treatment、scorer、
Agent/模型配置、环境、源码 commit、快照、随机种子、预算、输入 hash、结果和
artifact 校验和。

`retrieval-ranking` 轨道使用 `retrieval-batch-record/v1`：一条记录覆盖整组 query，
不伪造 Agent task 字段。它固定 benchmark/corpus/labels/scorer、Lorelum commit、
Profile、model/native runtime、N/K 和结果附件 hash；失败的 batch 同样保留，
但不得把 partial result 拼成完整评测。Store/index 或 harness client setup 失败时，
record 记录结构化 `setup_failure`，并且仍不包含部分候选或最终名单。validator 按
record 声明的 `suiteVersion/revision` 校验对应 fixture hash、corpus digest 和 N/K；
已有 record 的 revision 不得继续停留在 `candidate` 或 `pilot`。
