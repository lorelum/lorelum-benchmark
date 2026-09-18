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
incubator/practice-injection/async-report-lifecycle-evaluator-v1/
  private/
    snapshot.json
    evaluator/v1/
      evaluate.ts
      evaluator.yaml
      identity.ts
      result.ts
      harness.ts
      checks/
        lifecycle.ts
        compatibility.ts
      oracle.yaml
      fixtures/
        manifest.yaml
        reference/
        equivalent/
        negative/<check-id>/
      calibration/
        run.ts
      snapshot.json
      *.test.ts
```

`evaluator.yaml` 固定 candidate id、#196 source commit、snapshot id、oracle 和 evaluation result schema。`private/evaluator/v1/snapshot.json` 列出除自身和 focused tests 外的 evaluator source、oracle、fixture manifest 与检查模块 SHA-256；fixture overlay 的 SHA-256 由 `fixtures/manifest.yaml` 独立记录。仓库既有 snapshot discovery 还要求每个 `incubator/<track>/<package>/private/snapshot.json` 可验证，因此 sibling package 的外层 snapshot 冻结整个 evaluator 包，内层 snapshot 仍由 evaluator runtime 用于 v1 source identity。既有 #196 `private/candidate.yaml` 与 `private/snapshot.json` 保持逐字节不变。

选择该方案是为了保持 #197 已锚定的 candidate 身份，同时让 evaluator 具备自己的版本、hash 与演进边界。Evaluator 位于相邻私有包，而不是 #196 candidate 目录内部；#197 的 staged runner 会把 candidate 目录的实际文件集合与该 snapshot 精确比较，向 candidate 目录新增文件会让已合并 runner 报 `candidate snapshot file set does not match`。把 evaluator 写回 #196 snapshot 或复用 suite 的 structured/v2 evaluator 都要求改变已合并的 candidate 身份或把 candidate 伪装成正式 task，因此不采用。v1 在 #202 PR 合并时冻结；之后任何检查、oracle、fixture 或结果语义变化都必须创建 `private/evaluator/v2/`。

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

具体判定如下：

| check id | 外部行为判定 |
| --- | --- |
| `lifecycle-queued-processing-completed` | 创建后为 queued；三次单 segment worker step 依次得到 `processing/1`、`processing/2`、`completed/3`，HTTP reader 与 worker 视图一致。 |
| `lifecycle-failure-and-retry` | 在指定 segment 得到 `failed/1` 与稳定错误；`--retry` 从最后 checkpoint 继续到 completed，不重置进度。 |
| `progress-persistence` | 一个 worker process 推进后重建 HTTP server/reader，仍能读取同一持久化进度，再继续到 completed。 |
| `pause-at-checkpoint` | pause 请求返回 processing 并设置 pause request；下一次 step 在下一 checkpoint 停在 paused，不能立即中断或忽略请求。 |
| `resume-preserves-progress` | paused report resume 后状态回到 processing，已完成 segment 不变，随后完成全部工作。 |
| `v1-v2-overlap-preserves-safe-state` | v1 与 v2 reader/writer 交替读写安全状态时，v1 必须继续处理，保留所有未知顶层字段，双方均可读取同一核心状态。 |
| `rollback-preserves-extension-fields` | 模拟旧路径接管 v2 状态后，v1 可以继续并保留扩展字段，也可以稳定拒绝且不写文件；不能以默认状态覆盖原数据。 |
| `unsafe-state-preserved-and-rejected` | corrupt JSON、unsupported schema、缺失必需字段和 id mismatch 均稳定拒绝，且原文件字节不变。 |
| `concurrent-workers-serialize-progress` | 多个 worker 并发推进同一 report，最终进度准确、无丢失更新或重复完成。 |

每个检查使用独立临时 data dir，不得修改 candidate workspace。server 端口为 `0` 并由启动输出发现；worker 通过公开 CLI 启动。允许有界启动/退出 timeout，但语义断言不得依赖墙钟等待、随机延时或外部网络。

### 3. fixtures 使用 base + private overlay，并记录完整 provenance

`fixtures/manifest.yaml` 固定 #196 source commit、candidate snapshot id 和 base public starter。每个 fixture overlay 只保存相对 parent 的变更文件及 SHA-256；calibration 在临时目录重组 fixture，不复制或修改仓库中的 public starter。

fixture 采用分层继承：

- `public-starter`：不携带 overlay，作为 #196 baseline。
- `reference`：从 public-starter 增加最小必要 overlay，只修复已声明的兼容与回退缺口，不重构无关代码；九个检查全部 `pass`。
- `equivalent`：从 public-starter 独立实现一套正确方案，不直接复用 reference；内部职责分配和兼容策略可以不同，但九个检查逐项结果与 reference 相同。
- `negative/<check-id>`：继承 reference，再增加一个 whole-file mutation overlay，只破坏目标 check；完整矩阵必须表现为目标 check `fail`、其余八项 `pass`。

若任一 check 无法被 reference、equivalent 和 negative 组合区分，candidate 保持 candidate，停止模型运行。

fixture 的逻辑 id、parent 与目录如下：

```text
public-starter
  parent: none
reference
  parent: public-starter
equivalent
  parent: public-starter
negative/<check-id>
  parent: reference
```

每个 negative 使用完整的 nine-check expectation matrix，而不是只检查目标项。若一个 mutation 产生额外未声明失败，calibration 失败，避免夹具自身带来旁路影响。

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

overall status 的优先级固定为 `indeterminate > fail > pass`。每个 check 必须存在于输出中；semantic fail 使用稳定 reason code，运行失败使用 `indeterminate` 与稳定 reason code。passing check 不输出 reason。结果不得包含 timestamp、机器路径、环境变量、duration 或可能漂移的文本。

失败断言遵循公开精确 code 规则：只在 starter 文档、公开测试或既有公开 API 行为已经声明具体 code 时断言精确 code，例如 `WORKER_SEGMENT_FAILED`、`STATE_CORRUPT`、`STATE_VERSION_UNSUPPORTED`、`STATE_ID_MISMATCH`；不得断言 summary 文案。未公开的具体错误 code 只能作为 `indeterminate` 或稳定失败类别，不得成为实现偏好门槛。

### 5. evaluator 身份与 fixture 身份必须冻结且可复算

evaluator 运行前先验证：

- candidate id、source commit 和 snapshot id 与 #196 固定值完全匹配；
- `oracle.yaml` 与 fixtures manifest 可解析且 check id 集合完整；
- fixture overlay 和 evaluator source snapshot 的 hash 与 manifest 一致；
- sibling package 外层 snapshot 保持完整，并由仓库 `bun run validate` 独立验证；
- 运行环境具备 Bun，且不能通过环境变量关闭身份检查。

任何一项失败都返回 `indeterminate`。candidate workspace 会被 Agent 修改，因此 evaluator 不要求它与 #196 snapshot 全量一致；它验证的是 evaluator 自身记录的任务锚点、fixture base 和 private source identity。v1 在 #202 PR 合并时冻结，之后修改检查、oracle mapping、fixture 或 evaluator 行为必须创建 `private/evaluator/v2/`。

### 6. 条件盲化与 #200 交接只暴露稳定场景标识

evaluator invocations 对 timing conditions 完全相同，不接收 condition metadata，也不读取 #197 audit、#199 provenance 或 #200 rubric。编排层只可把稳定的 check id、`pass|fail|indeterminate` 和非敏感 reason 作为私有 hard-gate 结果保存；reference、oracle 断言、fixture 内容、私有路径和实现细节不得进入 Agent workspace、公开 trace 或 JudgeAgent 输入。

#200 可以引用稳定 check id 说明 hard gate 边界，但不得读取 `oracle.yaml`、fixture 内容或 evaluator source。

#200 的允许输入严格限制为 evaluator version、overall status 和稳定 check id 集合。它不得读取逐 check status、逐 check reason、`oracle.yaml`、fixtures、evaluator source 或完整 evaluator JSON。

#201 作为私有实验编排者可以在 private artifacts 中保存完整 evaluator 结果，但不得把完整结果注入 Agent workspace、公开 trace 或 JudgeAgent。

接入方式固定为私有自包含 CLI：

```text
bun run <repo>/incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/evaluate.ts <agent-app-root>
```

本 change 不修改根 `package.json`，也不修改 #197 runner；#201 preflight 在后续独立 change 中显式调用该路径。

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

## Confirmed Planning Decisions

- 验收面固定为 candidate public entrypoints、外部 HTTP API/worker CLI 与持久化字节行为；不检查内部目录、类名、函数名或模块结构。
- `public-starter` 必须通过 lifecycle、progress、pause 与 resume 检查，并分别在 old/new overlap 的 unknown-field preservation 与 rollback fail-closed 上失败。
- evaluator 输出固定为 `pass|fail|indeterminate` 与 exit code `0|1|2`；不调用 LLM，不使用加权分数，不把 `indeterminate` 当作低分。
- evaluator 使用相邻私有包中的 `private/evaluator/v1/` 身份，不修改 #196 candidate snapshot 或 #197 anchor。
- private fixtures 使用分层 parent：reference 从 public-starter 取得最小修复，equivalent 从 public-starter 独立实现，negative 从 reference 只注入一个 mutation；每个 overlay 只存变更文件与 SHA-256。
- #200 只可读取 evaluator version、overall status 与稳定 check id 集合，不得读取逐 check status/reason 或任何 private oracle、fixture、source。
- 精确错误 code 只在公开契约已经声明时断言；summary 文案不参与判定。
- schema 1/2 的安全状态保留所有未知顶层字段；overlap 必须保留并继续，rollback 可以保留或明确拒绝且保持原字节。
- evaluator 只提供私有自包含 CLI，不增加根 package script，不修改 #197 runner。
- v1 在 #202 PR 合并时冻结；之后任何语义变化创建 v2。

无剩余阻塞性 Open Question。
