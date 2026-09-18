## Context

Issue #202 要为 `incubator/practice-injection/async-report-lifecycle-v1/` 建立 P1 的确定性 hard gate。该 candidate 已由 #196 固定公开 task、starter、用户约束补充与 `CHECKPOINT: compatibility-slice-ready`，#197 又将其 source commit `74962ee0c98f7775b0eb626f7b49b878035d8778` 和 snapshot id `ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2` 写进 staged runner preflight。

当前 candidate 只有公开测试，且 `private/candidate.yaml` 明确记录 `evaluator: none`。因此本 change 不能把 evaluator 塞入既有 candidate snapshot 身份，也不能修改公开行为；需要在 private 边界内新增可独立版本化、可校准、可审计的结果契约。

## Goals / Non-Goals

**Goals:**

- 提供一个不调用 LLM、不依赖 Practice provenance、delivery node 或 JudgeAgent 的确定性 evaluator。
- 以 HTTP API、worker CLI、持久化文件和进程行为为唯一判定面，验证公开任务已经声明的外部语义。
- 用 reference、equivalent、public-starter 和逐检查 negative/mutation fixtures 证明判别力，并拒绝实现布局偏好。
- 固定 evaluator、oracle mapping、fixture provenance 和 candidate snapshot 身份，输出稳定 check id 供 #200/#201 私有引用。
- 在 identity 漂移、fixture 缺失、runner 无法执行或输出不完整时 fail closed，不伪造 `pass` 或低分。

**Non-Goals:**

- 不评价 Pack 质量、Lore query、Practice 适用性、自动触发、delivery timing 或 Agent 回复的软质量。
- 不实现或修改 #197 runner、#199 treatment、#200 JudgeAgent/provider/rubric 或 #201 九次实验。
- 不修改 #196 public task/starter、`private/candidate.yaml` 或既有 `private/snapshot.json`。
- 不登记 active suite、不冻结 task revision、不创建正式 record、不调用模型。

## Decisions

### 1. 使用独立的 `private/evaluator/v1/`，保持 #196 snapshot 不变

新增 evaluator 位于：

```text
incubator/practice-injection/async-report-lifecycle-v1/private/evaluator/v1/
```

版本内包含 evaluator 入口、检查模块、结果类型、`oracle.yaml`、`fixtures/manifest.yaml`、fixture overlays、calibration runner 和 evaluator source snapshot/manifest。既有 `private/candidate.yaml` 与 `private/snapshot.json` 保持逐字节不变。

选择该方案是为了保持 #197 已锚定的 candidate 身份，同时让 evaluator 具备自己的版本、hash 与演进边界。把 evaluator 写回 #196 snapshot 或复用 suite 的 structured/v2 evaluator 都要求改变已合并的 candidate 身份或把 candidate 伪装成正式 task，因此不采用。

### 2. evaluator 只执行黑盒行为，不读取实现结构

evaluator 会把 candidate workspace 或 fixture 投影到临时目录，通过公开文档中的 `src/server.ts`、`src/worker.ts`、`/api/v1`、`/api/v2` 与持久化 JSON 行为执行检查。它不得要求特定类名、模块数、目录层级、函数名、dataflow 形状或 reference 文件。

检查固定为以下稳定 id：

- `lifecycle-queued-processing-completed`
- `lifecycle-failure-and-retry`
- `progress-persistence`
- `pause-at-checkpoint`
- `resume-preserves-progress`
- `v1-v2-overlap-preserves-safe-state`
- `rollback-preserves-extension-fields`
- `unsafe-state-preserved-and-rejected`
- `concurrent-workers-serialize-progress`

每个 id 由独立检查函数产生，整体只在所有检查均 `pass` 时通过。选择进程级黑盒而不是 AST/import/source pattern，是为了避免把 reference 的实现偏好变成语义门槛。

### 3. fixtures 使用 base + private overlay，并记录完整 provenance

`fixtures/manifest.yaml` 固定 #196 source commit、candidate snapshot id 和 base public starter。每个 fixture overlay 只保存相对 starter 的变更文件及 SHA-256；calibration 在临时目录重组 fixture，不复制或修改仓库中的 public starter。

校准矩阵至少包含：

- `reference`：全部九个检查 `pass`。
- `equivalent`：内部结构与 reference 不同，但九个检查的逐项结果与 reference 完全一致。
- `public-starter`：允许 lifecycle/progress/pause 检查通过，但必须命中公开 baseline 的兼容与回退缺口；整体不得 `pass`。
- `negative/<check-id>` 或等价 mutation：每个检查至少有一个定向变体使其失败，且失败原因必须落在目标 check id。

若任一 check 无法被 reference、equivalent 和 negative 组合区分，candidate 保持 candidate，停止模型运行。

### 4. oracle mapping 与结果契约分离

`oracle.yaml` 只在 private evaluator 内把稳定 check id 映射到公开 requirement、fixture expectation 和失败类别。evaluator 输出至少包含：

```json
{
  "schema_version": "async-report-deterministic-evaluator/v1",
  "evaluator_version": "v1",
  "candidate_snapshot_id": "ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2",
  "status": "pass|fail|indeterminate",
  "checks": [
    { "id": "lifecycle-queued-processing-completed", "status": "pass|fail|indeterminate", "reason": "optional stable reason" }
  ]
}
```

不输出加权总分，不接收 condition、delivery node、Pack ref、Practice id 或 Judge input。稳定 exit code 为：`0=pass`、`1=fail`、`2=indeterminate`；内部错误、identity 漂移、fixture 缺失和超时均返回 `2`，不得降级为 `fail` 或 `pass`。

### 5. evaluator 身份与 fixture 身份必须冻结且可复算

evaluator 运行前先验证：

- candidate id、source commit 和 snapshot id 与 #196 固定值完全匹配；
- `oracle.yaml` 与 fixtures manifest 可解析且 check id 集合完整；
- fixture overlay 和 evaluator source snapshot 的 hash 与 manifest 一致；
- 运行环境具备 Bun，且不能通过环境变量关闭身份检查。

任何一项失败都返回 `indeterminate`。修改检查、oracle mapping、fixture 或 evaluator 行为必须创建 `private/evaluator/v2/`，不得原地改写已经用于验证或记录的 v1。

### 6. 条件盲化与 #200 交接只暴露稳定场景标识

evaluator invocations 对 timing conditions 完全相同，不接收 condition metadata，也不读取 #197 audit、#199 provenance 或 #200 rubric。编排层只可把稳定的 check id、`pass|fail|indeterminate` 和非敏感 reason 作为私有 hard-gate 结果保存；reference、oracle 断言、fixture 内容、私有路径和实现细节不得进入 Agent workspace、公开 trace 或 JudgeAgent 输入。

#200 可以引用稳定 check id 说明 hard gate 边界，但不得读取 `oracle.yaml`、fixture 内容或 evaluator source。

## Risks / Trade-offs

- [黑盒检查可能漏掉内部数据损坏] → 通过 v1/v2 交替读写、rollback 和原始字节保留检查覆盖外部可观察的数据安全，不把内部错误信息当 oracle。
- [Windows 与 Linux 的文件锁/进程行为差异导致不稳定] → 检查保持进程级、端口自动分配、临时目录隔离，不依赖墙钟延迟或特定文件系统顺序，并在 CI/本地以同一命令验证。
- [fixture overlay 与 public starter 漂移] → manifest 固定 base snapshot 和每个 overlay 的 SHA-256，运行前 fail closed。
- [hard gate 过强，把合理等价实现判失败] → reference/equivalent 必须逐 check 一致，任何依赖文件布局的断言只能进入 private quality probe 或删除。
- [evaluator 结果被误当作正式任务结论] → candidate 保持 incubator、不登记 suite、不创建 record，结果只作为 P1 hard gate 与后续诊断输入。

## Migration Plan

1. 保持 #196 public/candidate snapshot 不变，新增独立 evaluator v1 目录。
2. 完成 oracle、fixtures 与 calibration runner，并先验证 public starter 的预期缺口。
3. 在 `bun run validate`、focused deterministic tests、public/private leakage audit 和 `git diff --check` 通过后，再由后续独立判断决定是否运行 #201。
4. 回滚时删除本 change 新增的 private evaluator 目录即可；无需迁移 suite、record 或已合并 runner。

## Open Questions

- 是否确认采用“candidate public entrypoints + 外部 API/CLI + 持久化字节”作为黑盒验收面，且不要求任何内部目录、类名或模块结构？
- 是否确认 `public-starter` 的预期失败只需覆盖旧新并行 unknown-field preservation 与 rollback fail-closed，而 lifecycle/progress/pause/resume baseline 保持通过？
- 是否确认 evaluator 输出使用 `pass|fail|indeterminate` 与 exit code `0|1|2`，且不引入任何 LLM 或加权分数？
- 是否确认 #200 仅可引用 check id 和 hard-gate 状态摘要，不能读取 oracle、fixtures 或 evaluator source？
