## Why

Issue #96 需要一条独立轨道，验证 coding agent 在工程任务中会不会主动用上 Lorelum--即自主发现并加载 Skill、主动查询 Practice、按约束实现。现有两条轨道都不覆盖这个命题：`react-skill-comparison` 显式注入 vercel skill 测其有无用处；`practice-injection`（`incubator/practice-injection/login-page-layered-api-v1`）显式注入 Practice 测其内容效力。区别在 Practice 怎么来：前两条都把东西塞给 agent 看效果，本轨道看 agent 会不会自己去找。

本 change 只支持 mock 阶段的方向性观察，不验证真实检索质量，不把结果升级为 benchmark 或产品结论。

## What Changes

- 新增 `incubator/skill-trigger-orchestration/` 候选工作区，承载 mock 阶段 Skill 触发编排验证。
- 第一个任务场景：异步副作用生命周期超出组件（useEffect 发请求，组件卸载后 setState）。技术栈 Vite + React 19 + TS（SPA），与 practice-injection 一致。
- mock 返回三字段结构：范围约束、命中 Practice（可审计来源）、行为约束（非指令）。
- 注入放 prompt 层，不放 harness，保留 agent 会不会听作为待验证变量。
- 三个 condition 对照：baseline（地板）、lorelum-retrieval（实验组，走完整链路）、irrelevant-practice（盲从检测）。不设 oracle-practice 天花板。
- candidate 先跑本地 pilot 确认 baseline 下 agent 确实会失败，再正式用作对照。

## Capabilities

### New Capabilities

- `skill-trigger-orchestration-pilot`：为 mock 阶段 Skill 触发编排验证定义 candidate 结构、mock 查询契约、三条件对照与本地执行治理。

### Modified Capabilities

无。本 change 不改写既有 stable spec。

## Impact

- 关联 issue：#96。
- 工作区：`incubator/skill-trigger-orchestration/`，候选阶段，不进 `suites/`。
- 复用 practice-injection 的执行治理模式与现有 Pi v2 runner、tool-policy 机制。
- 不依赖真实 Lorelum CLI/检索引擎。
- 不创建 `results/records/`、不升级 suite revision、不变更活跃 runner/treatment/schema/environment。
- 私有材料不得进入 agent 工作区或模型输入。
