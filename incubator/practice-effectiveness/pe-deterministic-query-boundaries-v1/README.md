# PE Deterministic Query Boundaries v1 原型

这是可执行、来源受限的 `TK-local-query` 草案。它尚未拥有可审计的真实查询契约，因而
不是 suite task、不可生成 benchmark 结论，也不可 materialize 为 intervention。准入
条件见 `source-audit.md` 与 `reuse-card.md`。

Agent 只应获得 `public/task.md` 和 `public/starter/`。`private/` 中的 evaluator、
oracle 和 reference 只能由评审者在本地使用，不能复制进 Agent workspace。

从仓库根目录执行：

```sh
bun test incubator/practice-effectiveness/pe-deterministic-query-boundaries-v1/private/evaluator
CANDIDATE_PATH=incubator/practice-effectiveness/pe-deterministic-query-boundaries-v1/private/reference/src/query.ts bun test incubator/practice-effectiveness/pe-deterministic-query-boundaries-v1/private/evaluator
```

第一条命令应失败，证明 starter 尚未满足隐藏 contract；第二条命令应通过，证明
reference 与 evaluator 一致。两条命令只读取本地文件，不调用模型、Pi、网络或外部服务。
