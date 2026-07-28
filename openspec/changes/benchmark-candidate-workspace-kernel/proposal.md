## Why

#98 原本把 Practice candidate 的共享 kernel 作为单一轨道设施。但在规划澄清中发现，仓库里
Skill 轨道（suites/.../v1/）与 Practice 轨道（incubator/practice-injection/）都需要可复现的
candidate workspace materialization、public/private 隔离、路径安全、hash 固定和声明角色的校准编排。
两类输入契约形状不同，但共享同一套机制。因此 #98 的目标从「Practice candidate kernel」改为
「版本化的 benchmark candidate workspace kernel」：提供与轨道无关的公共 core，并把轨道专属契约
作为独立版本化的 profile。Practice 是第一个 consumer，Skill 轨道可在未来的新 candidate 或新
task revision 中接入同一机制，而已冻结的 ealistic-react-skill-comparison 任务的历史快照不受影响。

## What Changes

- 新增版本化的 benchmark candidate workspace kernel，采用分层 core + profile 架构：
  - core/v1：track-agnostic 机制，包含 materialization、public/private 隔离与泄露审计、
    kernel/input/resolved hash、以及声明角色后执行命令并核对预期的校准编排。core 不解读任何
    领域字段。
  - profile：轨道专属契约，首版定义 injection-calibration/v1（Practice 注入型）与
    	reatment-comparison/v1（Skill 型）的契约形状，但不迁移已冻结的 Skill task。
  - materializer：首版实现 eact-vite/v1，并在 core 契约中预留 materializer_kind 字段，
    为 Next 或其它技术栈留出并列 materializer 的空间。
- candidate/task manifest 声明组合 kernel: { core, profile, materializer_kind }，作为轨道区分
  的权威依据。
- core 契约强制 starter 只提交 manifest、lockfile 和源码；
ode_modules/、dist/、
  	est-results/ 等生成物由 materialize 产出，不得入库。
- 新建 docs/KERNEL.md，集中承载版本体系、兼容矩阵、生成物规范和面向作者/评审者的使用指南
  （含轨道区分依据）。
- 用一个不含 Practice/Skill 领域语义的中性 contract fixture 独立验证 core 全链路；不接真实轨道 task。
- 不修改 #75 登录页 candidate、已冻结的 Skill task、活跃 suite、共享 runner、schema 或正式 record。

## Capabilities

### New Capabilities

- enchmark-candidate-workspace-kernel：版本化、track-agnostic 的 candidate workspace kernel
  core 契约，含 materializer 调度、public/private 隔离、resolved input hash 和声明角色校准编排。
- enchmark-candidate-calibration：共享的声明角色校准编排入口，调用 candidate/task 拥有的命令
  并核对预期，不解读领域语义。
- enchmark-candidate-resolved-snapshot：可复现的 resolved snapshot 契约，绑定 core 版本/hash、
  profile 声明、materializer_kind、input 源码 hash 和 materialized public 输出 hash。

### Modified Capabilities

- login-practice-probe-fixture：明确 #75 登录 candidate 保持历史独立输入，不迁移、不改写；
  新增 kernel-backed candidate 不得要求其迁移。

## Impact

- 预期新增：src/benchmark/kernel/ 下的 core、materializer 和 profile 契约代码，以及
  docs/KERNEL.md。
- src/benchmark/snapshot.ts 及其聚焦测试可能新增 candidate/workspace resolved-input 验证路径；
  既有 suite 与 #75 snapshot 语义保持兼容。
- Practice 轨道专属的 candidate 扩展、#89 两题迁移、injection channel 实现和已提交生成物清理，
  移至独立 issue 与独立 OpenSpec change（practice-injection-candidate-expansion），在 #98 合并后
  rebase 接入。
- 不执行模型调用、retrieval、盲评、正式 record、suite revision 或 #90 批处理。