# 仓库瘦身计划

本计划旨在消除 benchmark 仓库中 starter 跨版本物理重复带来的冗余。瘦身以可复现
性和版本隔离为不可妥协约束，通过分阶段改造 snapshot 契约实现，而非简单删除文件。

> **状态**：可行性探讨草稿，非可执行方案。本计划涉及 `snapshot.ts`、
> `coordinator.ts`、evaluator 与 `task.yaml` schema 的改动，按 AGENTS.md 的
> OpenSpec 流程，实现前必须先创建 GitHub issue、建立 `openspec/changes/`
> change、在 `codex/<change-name>` 分支开仅含 OpenSpec artifacts 的初始 PR，
> 并完成规划澄清。下列内容是该流程的设计输入，不替代它。

## 现状量化

- 全仓约 22.4k 行，其中 `suites/.../public/starter/app/` 占约 8.3k 行（37%），
  378 个文件。
- 17 个 starter 各自带 9 种完全相同的样板文件（`tsconfig.json`、`next-env.d.ts`、
  `next.config.ts`、`.gitignore`、`playwright.config.ts`、`bun.lock`、`package.json`、
  `tests/run-e2e.ts`、`app/layout.tsx`），每种 17 份。
- 20 个任务版本中 13 个 `lifecycle_stage: retired`，仍带完整 starter；其中
  `report-insights-conditional-loading` v1–v8 占大头。
- retired 版本不在 `default_active_task_set` 中，当前也无任何运行记录引用它们
  （`results/records/` 仅有 `.gitkeep` 与 README）。

## 冗余根因

`src/benchmark/snapshot.ts` 的 `snapshotFiles()` 遍历任务目录下每个文件计算独立
SHA256，迫使每个 revision 自带全部文件，包括与其它版本逐字节相同的样板。每个
revision 因此必须自包含、可被 snapshot 逐文件校验。

### 关键耦合点

改造 snapshot 契约必须同步改动以下三处路径解析，否则共享或引用 starter 会导致
校验失败或 workspace 实体化失败：

- `src/benchmark/snapshot.ts` 的 `snapshotFiles()` -- 遍历任务目录计算哈希。
- 各任务 `private/evaluator/evaluate.ts` 的 `resolve(import.meta.dir, "..", "..")`
  -- 相对 evaluator 自身定位 `public/starter/app`。
- `src/benchmark/runner/pi/v2/coordinator.ts:158` 的
  `resolve(task.path, "public", request.candidate_path)` -- 拷贝 starter 给 agent。

## 关键约束与未决问题

- **retired 可执行性承诺**：`docs/TASK_LIFECYCLE.md` 规定 retired 版本「文件仍
  保留在仓库中，snapshot 仍可校验，且可通过显式任务引用执行」。删除 retired 版本
  的 starter 会使其无法被显式执行，违背该承诺。因此 retired 版本的 starter 处置
  不能简单删除，需先走 OpenSpec change 修订 TASK_LIFECYCLE 的承诺，或改为外部
  存储引用等不破坏可执行性的方案。此问题本计划不预设答案，留作 OpenSpec 规划
  澄清阶段的输入。
- **版本隔离与共享的矛盾**：若多个 revision 共享同一 starter 基座，基座改动会使
  所有引用它的历史版本 snapshot 同时失效，破坏版本隔离。阶段二的方案必须解决
  这个矛盾--例如基座内容版本化、引用锁定到具体 digest--本计划仅指出该矛盾，
  具体机制留待设计阶段确定。

## 阶段一：retired 版本处置（待定）

原方案拟删除 retired 版本的 `public/starter/`，但如上所述与 TASK_LIFECYCLE 的
可执行性承诺冲突，**该方案作废**。retired 版本的瘦身需先在 OpenSpec change 中
明确下列任一路径，本计划不预先选定：

- 修订 TASK_LIFECYCLE，允许 retired 版本仅保留 snapshot 记录、不保留可执行 starter；
- 将 retired starter 迁移到外部存储，snapshot 改为记录引用与校验和；
- 维持现状，retired 版本不参与瘦身，瘦身全部由阶段二承担。

该决策依赖一个事实复核：retired 版本目前无任何运行记录引用，但承诺是否仍需保留
需由维护者在规划澄清阶段确认。

## 阶段二：active 版本共享 starter 基座

改 snapshot 契约支持引用型 starter，消除 active 版本间的样板重复。风险中等、
收益最大。

### 改动

- 新增 `suites/<suite>/_shared/starter-base/`，存放公共样板
  （`tsconfig.json`、`bun.lock`、`next-env.d.ts`、`playwright.config.ts`、
  `tests/run-e2e.ts`、`app/layout.tsx`、dashboard 组件等）。
- 任务 `public/task.yaml` 新增 `starter_base: { ref: "../../_shared/starter-base", digest: "<sha256>" }`
  字段，引用锁定到具体 digest 以保证版本隔离：基座后续改动不影响已锁定版本。
- 改 `snapshot.ts`：遇到 `starter_base` 引用时，校验引用目标存在、内容与 digest
  匹配，并将该 digest 纳入 snapshot；不要求文件物理复制到任务目录。
- 改 `coordinator.ts`：实体化 workspace 时，先拷 `starter_base` 目录，再覆盖任务
  本地 `public/starter/app` 的差异文件。
- 改 evaluator 的 `baselineRoot`：解析 `starter_base` 与任务本地
  `public/starter/app` 的叠加。

### 影响

- 7 个 active 版本减约 4k 行。
- 任务目录只保留与基座不同的文件（如 `lib/repository.ts`、
  `lib/invitation-resolution-runtime.ts`、任务专属 page）。
  `workspace-invitation-reconciliation` v1/v2 这类 starter 完全相同的版本，
  直接全量引用基座、本地零文件。
- 契约改动影响所有任务，需全套测试覆盖与迁移说明。
- **版本隔离矛盾的解决**：引用锁定到 digest，基座改动只影响新引用它的版本，已
  锁定的历史版本 snapshot 不变。该机制是否充分需在设计中验证。

## 阶段三：版本间继承去重

针对同任务多版本 starter 高度相似的情况，允许 `task.yaml` 声明
`starter_inherits: <suite>/<slug>/<version>`，被继承版本作为基座，当前版本只列
差异文件。snapshot 与 coordinator 按继承链解析。

放在最后，因为阶段二已覆盖大部分重复，同任务版本间差异往往就在 evaluator/oracle，
starter 继承的边际收益递减，但需处理继承链、循环引用与冲突合并，复杂度上升。

## 测试与验收

每个阶段落地后必须通过：

- `bun run validate` 与 `bun run test:contracts` 全绿。
- `bun run test:realistic-repo` 至少跑通 active 版本的 calibrate。
- 新增测试：共享 starter 的 snapshot 校验、`starter_base` 解析与叠加、digest 锁定
  下基座改动不影响历史版本。

## 执行建议

- 本计划须先创建 GitHub issue 并建立 OpenSpec change，再在 `codex/<change-name>`
  分支开仅含 OpenSpec artifacts 的初始 PR；实现持续提交到该同一分支与 PR，不得
  拆分证据链。
- 阶段一（retired 处置）与阶段二（共享基座）因分别涉及 TASK_LIFECYCLE 承诺与
  snapshot 契约，宜各自走独立 OpenSpec change 与 PR，不合并。
- 阶段三作为阶段二的延伸，可并入阶段二的 change，视设计复杂度而定。
