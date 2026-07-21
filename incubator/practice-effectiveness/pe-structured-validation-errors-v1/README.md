# PE Structured Validation Errors v1 原型

这是可执行、来源受限的 `TK-config-validation` 草案。它尚未拥有可审计的真实配置消费者
契约，因而不是 suite task、不可生成 benchmark 结论，也不可 materialize 为 intervention。
准入条件见 `source-audit.md` 与 `reuse-card.md`。

Agent 只应获得 `public/task.md` 和 `public/starter/`；`private/` 中的 evaluator、oracle
和 reference 只能由评审者在本地使用。

```sh
bun test incubator/practice-effectiveness/pe-structured-validation-errors-v1/private/evaluator
CANDIDATE_PATH=incubator/practice-effectiveness/pe-structured-validation-errors-v1/private/reference/src/config.ts bun test incubator/practice-effectiveness/pe-structured-validation-errors-v1/private/evaluator
```

第一条命令应失败，第二条命令应通过。两条命令只读取本地文件，不调用模型、Pi、网络或外部服务。
