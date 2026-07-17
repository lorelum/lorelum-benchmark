# 任务生命周期与归档策略

主分支以可审计的源码快照形式保留每个正式任务版本。suite manifest 控制默认活动
集合；退休任务仍可显式运行。一个版本遵循以下生命周期：

```text
candidate -> pilot -> frozen -> official -> published -> retired
```

- `candidate`：incubator 材料，不进入活动 suite。
- `pilot`：已提交、可复现的 smoke/区分度测试，用于验证任务质量；不构成已发布的
  benchmark 结论。
- `frozen`：已有运行记录，且不可修改。prompt、starter、evaluator、oracle、模型设置
  或共享 runtime 变化时，必须创建新的 `vN` 版本。
- `official`：已批准用于 benchmark 运行和发布评审。
- `published`：已纳入发布，必须永久保留其运行记录。
- `retired`：在独立变更中从默认活动集合移除。文件仍保留在仓库中，snapshot 仍可校验，
  且可通过显式任务引用执行。

不得维护第二份可变归档副本。已提交的任务文件、`private/snapshot.json`、Git 源码
commit 和运行记录共同构成历史事实来源。大体积输出和 evaluator 日志应放入外部
artifact storage。

共享 evaluator helper 在 `src/benchmark/` 下按目录版本化。修改 helper 时应创建 `v2`
而不是重写 `v1`；每张任务卡固定其 `evaluator_version`。历史任务因此保留产生结果时
使用的准确 helper 契约。

退休一个版本前，确认其运行记录包含源码 commit、任务版本、evaluator 版本、snapshot id
和 artifact 校验和。绝不能重写或删除这些记录。
