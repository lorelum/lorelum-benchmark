## Context

#98 原计划为 Practice candidate 建立共享 kernel。规划澄清发现仓库内存在两类需要 candidate
workspace materialization 的输入契约：

- Skill 轨道（suites/realistic-react-skill-comparison/tasks/<slug>/v1/）：	ask.yaml（task-card
  schema）、完整提交的 public/starter/、ule-audit.yaml 声明 treatment、oracle.yaml 的
  scoring、mutations/ 的 anti-pattern，经 Pi runner v2 与 treatment-resolver 执行。其已冻结版本的
  starter 与 snapshot 是历史事实，不能被 resolver 回溯改写。
- Practice 轨道（incubator/practice-injection/<candidate-id>/）：candidate.yaml、显式 public
  overlay、conditions.yaml（baseline/oracle-practice/irrelevant-practice + retrieval）、Practice 卡
  经 condition-scoped-private-runtime 注入而不落 workspace、等长无关对照、decision_rule、
  calibration/fixtures/ 与 execution/。

两类契约形状不同，但共享同一套机制：materialize -> public/private 隔离 -> hash 固定 -> 声明角色
执行并核对预期。因此 #98 的目标改为提供与轨道无关的 core，把轨道专属契约作为 profile。

## Goals / Non-Goals

**Goals：**

- 建立版本化、track-agnostic 的 core/v1，提供 materialization、隔离审计、hash 固定和声明角色
  校准编排，不解读任何领域字段。
- 在 core 契约中预留 materializer_kind 字段，首版实现 eact-vite/v1 materializer，为 Next 或
  其它技术栈留出并列 materializer 空间。
- 定义 injection-calibration/v1 与 	reatment-comparison/v1 两个 profile 的契约形状（仅契约，
  不接真实 task）。
- 用中性 contract fixture 独立验证 core 全链路，不依赖 Practice/Skill 领域语义。
- 新建 docs/KERNEL.md 承载版本体系、兼容矩阵、生成物规范和使用指南。
- core 强制 starter 只提交 manifest+lockfile+源码，生成物由 materialize 产出。

**Non-Goals：**

- 迁移、修改、snapshot 或执行 #75 登录 candidate。
- 迁移已冻结的 Skill task；其历史 snapshot 不回溯改写。未来新 task revision 才声明 core+profile。
- 实现 Practice 轨道专属的 injection channel、candidate 扩展或 #89 两题迁移（移至独立 change）。
- 创建共享领域 oracle 或全局质量规则；core 不解读 profile 字段。
- 执行 Pi、模型 provider、retrieval、盲评、批处理、正式 record 或 suite revision。

## Decisions

### 分层 core + profile，而非按轨道各搞一套 kernel

core 是 track-agnostic 机制；profile 是轨道专属契约。candidate/task manifest 声明组合
kernel: { core, profile, materializer_kind }。这避免 materialize/hash/隔离逻辑重复分叉，让
profile 独立版本化（practice 升 v2 不碰 skill），并让已冻结 task pin 住 core v1 +
treatment-comparison/v1，永不被 resolver 回溯改写。

被否决的方案：按轨道各搞一套独立 kernel（materialize/hash 重复易分叉）；单一 kernel + 版本号
区分用途（版本号同时承载机制演进与轨道差异，语义混乱，frozen task 难独立 pin 机制版本）。

### core 不解读领域字段

core 只负责：按 manifest 声明的 materializer_kind 调度 materializer 产出 workspace；隔离 public
与 private 路径并审计泄露；计算 kernel/input/resolved hash；读取声明的角色（baseline/对照/oracle
等），按角色执行命令并核对预期。core 不解析 candidate.yaml、conditions、rule-audit、oracle 或
Practice 卡的领域语义。这些归 profile 与 candidate/task 私有材料。

### materializer_kind 预留并列空间

core 契约含 materializer_kind: string。首版实现 eact-vite。未来引入 Next 或其它栈时新增
materializer，而非升级 core 大版本。这避免未来被迫重 pin 所有 frozen task。

### profile 按 condition 模型命名

profile 用 injection-calibration（Practice 注入型）与 	reatment-comparison（Skill 型）命名，
而非轨道名。因为 profile 绑定的是抽象实验模型，未来可能有别的注入型实验复用同一 profile。

### resolved snapshot 同时固定 core、profile、materializer、input 与 resolved 输出

snapshot 记录 core 版本/hash、profile 声明、materializer_kind、input（源码+lockfile+manifest）hash、
materialized public 输出 hash。任一变化验证失败。生成物（node_modules/dist/test-results）排除。

### 生成物不入库

core 强制 starter 只提交 manifest+lockfile+源码；
ode_modules/、dist/、	est-results/、
.vite/ 等由 materialize 产出并计入 resolved hash。现有 incubator/practice-injection/ 已提交的
生成物在独立 Practice change 中清理，不在本 change 触碰。

### 轨道区分依据

读者看 manifest 的 kernel.profile 字段即知轨道（injection-calibration = practice，
	reatment-comparison = skill），不靠目录位置或 track 字段。

### 文档载体

新建 docs/KERNEL.md，集中承载版本体系、兼容矩阵、生成物规范和使用指南（作者/评审者为主，兼顾
reader）。不拆到 BENCHMARK_PROTOCOL.md 或新建 KERNEL_USAGE.md。

### 拆分 #98 与新 issue

#98 重写为仓库级 kernel；Practice 轨道专属内容（candidate 扩展、injection channel、#89 两题迁移、
生成物清理）移至独立 issue 与独立 OpenSpec change practice-injection-candidate-expansion，在 #98
合并后 rebase 接入。保持 PR #99 单一证据链，不另开实现 PR。

## Risks / Trade-offs

- [core 升级使多 candidate 失效] -> core 版本化，每个 resolved snapshot 绑定 core 版本/hash；不修改
  被 frozen/recorded candidate 使用的 core 版本。
- [materializer 泄露 private 路径或文本] -> 显式白名单，拒绝 private 路径穿越，审计 resolved
  workspace 是否含 private 标识与文件。
- [profile 契约形状强迫虚假一致性] -> profile 只声明轨道专属契约形状；candidate/task 拥有的
  evaluator、oracle、Practice 与 calibration fixture 保持私有且独立。
- [已 frozen skill task 被误迁移] -> 本 change 不迁移任何 frozen task；	reatment-comparison/v1
  只定义契约，未来新 revision 才声明。
- [现有 incubator 生成物违规] -> 由独立 Practice change 清理，不混入本 change 初始 PR。

## Migration Plan

1. 创建并验证本 OpenSpec-only PR（重写 #98 与 PR #99，创建 Practice 专属新 issue）。
2. 实现 core/v1 类型与 materialize/isolate/hash/calibrate；实现 eact-vite/v1 materializer。
3. 用中性 contract fixture 验证 core 全链路。
4. 定义 injection-calibration/v1 与 	reatment-comparison/v1 profile 契约类型。
5. 新建 docs/KERNEL.md。
6. 每步触契约时运行 un run validate，PR 保留验证证据。
7. #98 合并后，practice-injection-candidate-expansion change rebase 接入，迁移 #89 两题并清理
   已提交生成物。#75 与已 frozen skill task 始终不动。

## Open Questions

- 无遗留门禁问题。规划澄清结论已全部写回本 design/tasks 与 #98。