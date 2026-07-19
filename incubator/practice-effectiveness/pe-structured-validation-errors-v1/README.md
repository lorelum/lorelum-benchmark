# PE Structured Validation Errors v1 原型

这是 `../pe-structured-validation-errors-v1.md` 的可执行 incubator 原型，生命周期仍为
`candidate`，不是正式 suite task：没有 snapshot、run record 或可用于 benchmark 结论的
Practice treatment。

Agent 只应获得 `public/task.md` 和 `public/starter/`；`private/` 中的 evaluator、oracle
和 reference 只能由评审者在本地使用。

```sh
bun test incubator/practice-effectiveness/pe-structured-validation-errors-v1/private/evaluator
CANDIDATE_PATH=incubator/practice-effectiveness/pe-structured-validation-errors-v1/private/reference/src/config.ts bun test incubator/practice-effectiveness/pe-structured-validation-errors-v1/private/evaluator
```

第一条命令应失败，第二条命令应通过。两条命令只读取本地文件，不调用模型、Pi、网络或外部服务。
