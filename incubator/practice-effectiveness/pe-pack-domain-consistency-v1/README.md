# PE Pack Domain Consistency v1 原型

这是可执行、来源受限的 `TK-pack-publication` 草案。仓库尚无可审计的真实 pack/domain
contract，因而它不是 suite task、不可生成 benchmark 结论，也不可 materialize 为
intervention。准入条件见 `source-audit.md` 与 `reuse-card.md`。

Agent 只应获得 `public/task.md` 和 `public/starter/`；私有 evaluator、oracle 和 reference 不得进入 Agent workspace。

```sh
bun test incubator/practice-effectiveness/pe-pack-domain-consistency-v1/private/evaluator
CANDIDATE_PATH=incubator/practice-effectiveness/pe-pack-domain-consistency-v1/private/reference/src/publish-check.ts bun test incubator/practice-effectiveness/pe-pack-domain-consistency-v1/private/evaluator
```
