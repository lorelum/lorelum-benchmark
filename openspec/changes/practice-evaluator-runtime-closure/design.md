## Context

#117 的历史 workspace 重放已完成其当时可观察事实：两个 candidate 的 current evaluator
无法在自身 `public/starter/app` runtime 中找到 TypeScript parser。本 change 不重写历史
workspace、不修改 #117 结论；它只为 incubator candidate 后续 clean calibration 固定 runtime
依赖闭包。

现有 injection-calibration kernel 已 materialize 公共 starter、stage private calibration
并以校验和固定 calibration set。它尚未把 evaluator 的 TypeScript parser 及其解析位置作为
candidate runtime 的版本化输入，因而解析可能随仓库或宿主环境变化。

## Goals / Non-Goals

**Goals:**

- 让每个受影响 candidate 在私有、版本化、可校验的 runtime 描述中声明 evaluator 所需依赖。
- 让 kernel 只从声明的闭包启动 evaluator/calibration，支持使用锁定输入离线重建。
- 对缺失、篡改、版本不匹配、未声明依赖和越界解析根 fail closed。
- 保持 evaluator health 与正常完成后的 semantic/probe 结果分离，并验证 clean
  materialized calibration 的稳定性。

**Non-Goals:**

- 改变 candidate 公开行为、starter、Practice、条件、私有语义/质量验收、oracle 或评分。
- 修复或改写 #117 历史 workspace、其输出或结论。
- 提交 `node_modules`、运行 workspace、日志或生成物，或向公开输入、trace、issue 或 PR
  公开 private evaluator、oracle、Practice 或 calibration 内容。
- 调用 Pi、模型或 retrieval，创建正式 record，或修改冻结 task revision。

## Decisions

### Candidate-scoped, lockfile-backed runtime closure

每个受影响 candidate SHALL 声明一个仅供 private evaluator/calibration 使用的 runtime
closure。closure 由版本、来源、锁定依赖清单和完整性标识组成；其内容可由锁定输入在 CI
或离线环境重建，但仓库不提交安装产物。candidate snapshot SHALL 覆盖 closure 声明及其
重建输入。

实现 SHALL 解析到该 closure 的显式根，并以受控 runtime 启动 evaluator。它不得查找
candidate 根之上的 `node_modules`，不得接受仓库 root 或环境变量注入的解析路径，且不得把
宿主全局 Bun/Node 安装当作 evaluator 依赖来源。运行器自身的固定 executable 可以启动
closure；可执行文件不是解析器依赖的隐式来源。
The runner MAY pass a pre-resolved closure root to the evaluator via a private
runtime channel. When that channel is set, the evaluator MUST re-verify the
typescript parser integrity against the candidate declaration before using it;
it MUST NOT blindly trust an externally injected resolution path. Calibration
scripts that resolve the closure internally pass the resolution root directly
as a probe argument and do not use the override channel.

### Verification before execution

kernel SHALL 在 evaluator 或 calibration 启动前验证 closure schema、版本、来源和
integrity 标识。验证或受控安装失败时，校准返回稳定的 runtime execution failure，且不得
解析 evaluator stdout 为 semantic 或 Practice 观测结果。依赖安装只允许在隔离临时目录中
进行，使用已提交锁定输入，完成后目录必须被清理并保持忽略。

锁文件更新、依赖版本升级或完整性算法变化均构成 closure 新版本；维护者必须更新声明、
snapshot 和隔离测试。旧 candidate 的声明保持原样，以便可追溯重建。

### Calibration and isolation

隔离测试 SHALL materialize 各 candidate 的 public starter，并在没有仓库 root
`node_modules`、没有全局解析器回退的受控环境运行当前 private evaluator 与完整 calibration
matrix。reference、职责等价和 anti-pattern 的既有判断不变；semantic/probe 判定失败仍是
正常 evaluator 结果，runtime 启动或完整性失败则为 non-healthy execution failure。

runtime closure 与 private calibration 一样不得 materialize 到 agent workspace。公开
summary 只可包含 closure version/hash、稳定失败类别和健康状态，不得包含私有路径、命令、
evaluator 输出、oracle 或 Practice 内容。

## Risks / Trade-offs

- [锁定输入无法离线重建] -> fail closed，并把不足收敛为新的 issue；不得回退到宿主依赖。
- [依赖更新改变解析行为] -> 用新 closure version、完整性标识和 calibration 保留变更证据。
- [校准失败被错误当作语义失败] -> 保留 `execution-failed` 分类并回归测试字段省略。
- [私有输入泄露] -> 仅在私有 staging 使用 closure，审计 materialized public workspace 与
  public summaries。

## Migration Plan

1. 严格验证本 OpenSpec-only PR，并在 #122 记录规划确认。
2. 先以隔离测试复现当前缺少 parser 的失败，再实现新 closure resolver/validator 版本及
   candidate 私有声明。
3. 完成两个 candidate 的 clean calibration 和 tamper/failure-path 覆盖，立即勾选 tasks。
4. 运行 focused tests、`bun run test:pi:v2`、`bun run validate`、strict validation、
   leakage audit 和 `git diff --check`；只在新输出路径进行允许的 evaluator-only 校验。

回滚为移除新的 runtime resolver 与 candidate closure 声明。不得通过改写历史 workspace、
冻结 revision 或 #117 结论来回滚。

## Planning Confirmation

The requirements owner confirmed in #122 after initial OpenSpec-only PR #123:

- The two candidates' observable public behavior, starter, Practice controls,
  private semantic/quality acceptance, conditions, oracle, scoring semantics,
  and #117 historical interpretation remain unchanged. Historical workspaces
  are not rewritten; no Pi, model, retrieval, formal record, or suite revision
  is authorized.
- The closure is candidate-scoped, private, versioned, and fixed by locked
  rebuild inputs plus an integrity identifier. Dependency changes use a new
  closure version. CI and offline reconstruction use only those declared
  inputs; evaluator resolution cannot search ancestor `node_modules` or depend
  on global Bun/Node installation or incidental host state.
- Healthy calibration means that both candidate evaluators reliably start in an
  isolated materialized environment and emit healthy v2 contract results.
  Normal semantic/probe failure remains distinct from runtime execution
  failure; missing, tampered, or incompatible closure inputs fail closed.
- Private evaluator, oracle, Practice, and calibration contents stay out of
  agent workspaces, public prompts, traces, #122, and PR summaries. Public
  evidence is limited to closure version/integrity identifier, stable failure
  category, and health state.
