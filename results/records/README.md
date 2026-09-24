# Run Records（运行记录）

每次正式运行提交一份不可变记录。记录必须固定 suite、case、treatment、scorer、
Agent/模型配置、环境、源码 commit、快照、随机种子、预算、输入 hash、结果和
artifact 校验和。

`retrieval-ranking` 轨道使用 `retrieval-batch-record/v1`：一条记录覆盖整组 query，
不伪造 Agent task 字段。它固定 benchmark/corpus/labels/scorer、Lorelum commit、
Profile、model/native runtime、N/K 和结果附件 hash；失败的 batch 同样保留，
但不得把 partial result 拼成完整评测。
