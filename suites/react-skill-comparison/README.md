# React skill comparison fixtures

本 suite 的夹具来自真实开发中常见的工程问题样本，而不是从某个 Skill 的规则清单反向生成题目。这样可以避免 G1 只是在做同源材料的开卷题。

每个夹具至少组合一个目标机制、一个业务或接口不变量、一个失败/边界路径，以及一个看似合理但会留下工程缺陷的伪修复。私有 evaluator 重点验证动态行为，例如请求启动时序、依赖展开、对象与回调稳定性、持久化数据归一化、事件监听生命周期和授权后的数据边界；只验证 happy path 返回值不足以作为通过条件。

coverage manifest 中的条目是工程问题分类。Skill 是否直接覆盖某一类问题，应作为预先声明的分析分层，而不是题目来源或隐藏答案。正式实验必须在实验计划中固定该分层、任务集合、模型和重复次数。

版本 0.3.0 的四个候选夹具已退休，只保留用于显式重放和回归校准。版本 0.4.0 的新主夹具必须先通过
[`incubator/react-skill-comparison/fixture-selection.md`](../../incubator/react-skill-comparison/fixture-selection.md)
中的双来源与离线校准门槛，才可作为 `pilot` 任务加入 suite。

经审查的公开案例候选单独记录在
[`incubator/react-skill-comparison/public-case-candidates.md`](../../incubator/react-skill-comparison/public-case-candidates.md)。它们只用于证明题材的外部效度，不能复制为题面、私有 oracle 或解法。
