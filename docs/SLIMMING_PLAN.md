# 仓库瘦身计划

本计划旨在消除 benchmark 仓库中两类冗余：starter 跨版本物理重复，与 retired
版本的历史包袱。瘦身以可复现性和版本隔离为不可妥协约束，通过分阶段改造
snapshot 契约实现，而非简单删除文件。

## 现状量化

- 全仓约 22.4k 行，其中 `suites/.../public/starter/app/` 占约 8.3k 行（37%），
  378 个文件。
- 16 个 starter 各自带 9 种完全相同的样板文件（`tsconfig.json`、`next-env.d.ts`、
  `next.config.ts`、`.gitignore`、`playwright.config.ts`、`bun.lock`、`package.json`、
  `tests/run-e2e.ts`、`app/layout.tsx`），每种 16 份。
- 20 个任务版本中 12 个 `lifecycle_stage: retired`，仍带完整 starter；其中
  `report-insights-conditional-loading` v1–v8 占大头。
- retired 版本不在 `default_active_task_set` 中，正常实验不会跑到。

## 冗余根因

两层冗余根因不同：

- **starter 跨版本物理重复**：`src/benchmark/snapshot.ts` 的 `snapshotFiles()`
  遍历任务目录下每个文件计算独立 SHA256，迫使每个 revision 自带全部文件，
  包括与其它版本逐字节相同的样板。
- **retired 版本历史包袱**：`docs/TASK_LIFECYCLE.md` 规定 retired 版本
  「文件仍保留、snapshot 仍可校验」，因此完整 starter 一直留着。

### 关键耦合点

改造 snapshot 契约必须同步改动以下三处路径解析，否则共享或引用 starter 会
导致校验失败或 workspace 实体化失败：

- `src/benchmark/snapshot.ts` 的 `snapshotFiles()` —— 遍历任务目录计算哈希。
- 各任务 `private/evaluator/evaluate.ts` 的 `resolve(import.meta.dir, "..", "..")`
  —— 相对 evaluator 自身定位 `public/starter/app`。
- `src/benchmark/runner/pi/v2/coordinator.ts:158` 的
  `resolve(task.path, "public", request.candidate_path)` —— 拷贝 starter 给 agent。

## 阶段一：retired 版本轻量化

不改 snapshot 契约的核心语义，仅对 `lifecycle_stage: retired` 的任务放宽 starter
校验。风险低、收益快。

### 改动

- 改 `snapshot.ts`：对标记 `lifecycle_stage: retired` 的任务，跳过
  `public/starter/` 目录的文件校验，只校验留存的 `private/` 与 `public/task.*` 文件。
- 删除 12 个 retired 版本的 `public/starter/` 目录，保留 `private/snapshot.json`、
  `public/task.yaml`、`public/task.md`、evaluator、oracle。
- 在 `task-discovery.ts` 或 runner 入口加守卫：retired 且无 starter 时，显式运行
  报「retired revision, starter not available」，而非静默失败。

### 影响

- 删除约 3.5k 行 starter 重复。
- 不影响 active 版本与现行实验。
- retired 版本若被显式引用运行，需先恢复 starter（从 git 历史或快照）。

## 阶段二：active 版本共享 starter 基座

改 snapshot 契约支持引用型 starter，消除 active 版本间的样板重复。风险中等、
收益最大。

### 改动

- 新增 `suites/<suite>/_shared/starter-base/`，存放公共样板
  （`tsconfig.json`、`bun.lock`、`next-env.d.ts`、`playwright.config.ts`、
  `tests/run-e2e.ts`、`app/layout.tsx`、dashboard 组件等）。
- 任务 `public/task.yaml` 新增 `starter_base: { ref: "../../_shared/starter-base" }`
  字段。
- 改 `snapshot.ts`：遇到 `starter_base` 引用时，将被引用文件的内容哈希纳入
  snapshot（校验引用目标存在且内容匹配），但不要求文件物理复制到任务目录。
- 改 `coordinator.ts`：实体化 workspace 时，先拷 `starter_base` 目录，再覆盖任务
  本地 `public/starter/app` 的差异文件。
- 改 evaluator 的 `baselineRoot`：解析 `starter_base` 与任务本地
  `public/starter/app` 的叠加。

### 影响

- 8 个 active 版本减约 4k 行。
- 任务目录只保留与基座不同的文件（如 `lib/repository.ts`、
  `lib/invitation-resolution-runtime.ts`、任务专属 page）。
  `workspace-invitation-reconciliation` v1/v2 这类 starter 完全相同的版本，
  直接全量引用基座、本地零文件。
- 契约改动影响所有任务，需全套测试覆盖与迁移说明。

## 阶段三：版本间继承去重

针对同任务多版本 starter 高度相似的情况，允许 `task.yaml` 声明
`starter_inherits: <suite>/<slug>/<version>`，被继承版本作为基座，当前版本只列
差异文件。snapshot 与 coordinator 按继承链解析。

放在最后，因为前两阶段已覆盖大部分重复，同任务版本间差异往往就在 evaluator/oracle，
starter 继承的边际收益递减，但需处理继承链、循环引用与冲突合并，复杂度上升。

## 测试与验收

每个阶段落地后必须通过：

- `bun run validate` 与 `bun run test:contracts` 全绿。
- `bun run test:realistic-repo` 至少跑通 active 版本的 calibrate。
- 新增测试：共享 starter 的 snapshot 校验、retired 无 starter 的运行守卫、
  `starter_base` 解析与叠加。

## 执行建议

- 阶段一单独一个 PR：低风险、立竿见影。
- 阶段二与阶段三合并为一个架构改造 PR：改契约，需充分 review。
- 任务素材 PR（#86）保持不动，不夹带瘦身改动。
