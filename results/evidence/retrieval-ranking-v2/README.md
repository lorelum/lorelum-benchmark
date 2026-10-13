# Retrieval-ranking v2 跨设备结果附件

这些 JSON 是运行产生的完整结果附件的逐字节副本，仅含 case ID、候选/最终 Practice ID 名单与评分证据，不含 Pack 正文、模型、Store、cache 或运行日志。四份附件合计约 1 MB，随 Git 保存，避免交接依赖作者机器上的 ignored artifacts。

历史 record 不修改：其中 `result_artifact.path` 是原机器的生成位置；另一设备读取本目录同名文件，并以对应 record 的 `result_artifact.sha256` 验证内容。不需要访问原机器的绝对路径。这里不是另一个可修改的 fixture/archive；附件不可原地更新，新运行使用新身份。

| 文件 | SHA-256 |
| --- | --- |
| retrieval-ranking-v2-baseline-caecc53.json | b0406f2951558664ad0c468ee08c254dd8e22ff264f5d213579fd677c590dc25 |
| retrieval-ranking-v2-baseline-caecc53-replay.json | 0320e00d5b24fdea957663ee00b6ba1c21cedc2367868037ae2f1a88c49c09da |
| retrieval-ranking-v2-candidate-09e64be.json | 3420b8048233d15184db1e5a06bf641f4ec356d2385de8d48a619ed60523343e |
| retrieval-ranking-v2-candidate-09e64be-replay.json | 09b29632b76358700886f35d6417a223b010a5a101a6cacea276878b7459c252 |

为保持原始 SHA-256，本目录 JSON 禁用 Git 换行转换。读取附件不等于具备运行环境；重新跑模型仍需准备固定 Lorelum checkout、模型和 native runtime。
