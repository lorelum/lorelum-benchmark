# PE Pack Domain Consistency v1 原型

这是 `../pe-pack-domain-consistency-v1.md` 的可执行 incubator 原型，生命周期仍为 `candidate`；
不是正式 suite task，没有 snapshot、run record 或可用于 benchmark 结论的 Practice treatment。

Agent 只应获得 `public/task.md` 和 `public/starter/`；私有 evaluator、oracle 和 reference 不得进入 Agent workspace。

```sh
bun test incubator/practice-effectiveness/pe-pack-domain-consistency-v1/private/evaluator
CANDIDATE_PATH=incubator/practice-effectiveness/pe-pack-domain-consistency-v1/private/reference/src/publish-check.ts bun test incubator/practice-effectiveness/pe-pack-domain-consistency-v1/private/evaluator
```
