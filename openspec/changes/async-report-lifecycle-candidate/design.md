## Context

Issue #196 要求建立一个异步报表生命周期 candidate，作为 P1 timing MVP 的共同 starter 和公开会话脚本。当前主线已有 Pi v2 staged runner、通用 outcome contract 和 Practice-injection 候选布局，但没有一个能同时展示任务生命周期、分段进度、检查点暂停/继续、旧新版本并行及应用回退安全的异步报表任务。

本 change 只负责 candidate fixture 和公开任务情境。#197 的 delivery runner、#199 的 Pack-sourced treatment、#202 的 private evaluator、#200 的 JudgeAgent 以及 #201 的探索运行均不在本 change 内。candidate 继续放在 `incubator/`，不进入 active suite，不产生正式 record。

## Goals / Non-Goals

**Goals:**

- 建立 `incubator/practice-injection/async-report-lifecycle-v1/` 的可提交 candidate 目录。
- 提供仅由 `public/task.md`、`public/stage-2/task.md` 和 `public/starter/` 构成的 Agent 起始输入。
- 使用 Bun 原生 HTTP 服务、版本化 `/api/v1`/`/api/v2` JSON API、独立 worker CLI 和本地文件状态快照。
- 将任务分成初始检查/计划、用户补充兼容与回退约束、复查后实施和验证三个会话阶段。
- 提供固定三个 segment、checkpoint-bound pause/resume、失败后从最后 checkpoint 重试，以及旧新 API/worker 并行和回退安全的公开行为。
- 保存 candidate 元数据、source commit 和不可变 snapshot；通过 public/private 审计、候选测试、`bun run validate` 和 `git diff --check`。

**Non-Goals:**

- 不实现 Practice 查询、Pack treatment、delivery runner、自动触发或生产 Trigger Orchestrator。
- 不创建 private evaluator/oracle/calibration/scoring；这些由 #202 和 #200 的独立 change 负责。
- 不运行模型、不创建正式 record、不冻结 suite task revision、不进入 `suites/`。
- 不把兼容/回退的完整验收清单写进 Agent 可见题面，也不允许通过实现结构偏好替代外部可观察语义。

## Confirmed Decisions

### Starter and runtime

- 使用 Bun 原生 `Bun.serve`，不新增 Web 框架或外部数据库依赖。
- starter 的旧版 API/worker 是完整可运行路径；新版 API/worker 提供基础 happy path，但迁移/回退语义是不完整的，形成真实可修复的 baseline。
- 每个 report 固定三个 segment；worker CLI 每次最多推进一个 segment。
- public docs 记录 API、状态字段、版本差异和 worker CLI，不记录 hidden oracle、完整迁移答案或 Practice 文本。

### HTTP contract

v1/v2 都提供以下路径：

```text
POST /api/v1/reports
GET  /api/v1/reports/:id
POST /api/v1/reports/:id/pause
POST /api/v1/reports/:id/resume

POST /api/v2/reports
GET  /api/v2/reports/:id
POST /api/v2/reports/:id/pause
POST /api/v2/reports/:id/resume
```

状态响应包含 `id`、`status`、`completed_segments`、`total_segments`、`last_checkpoint` 和安全 `error`。错误响应只包含稳定错误码和非敏感摘要，不暴露原始状态文件、内部路径或堆栈。

### Persistence and compatibility

每个 report 保存到 `.data/reports/<id>.json`。状态写入通过同目录临时文件加原子 rename 完成，不使用 event log 或全局状态文件。

v2 使用 `schema_version: 2` 和增量兼容 metadata；v1 adapter 读取核心字段、保留未知字段并安全写回。遇到缺少必需字段、未知不可兼容版本或损坏 JSON 时返回稳定 compatibility/state error，原始状态不被覆盖。

失败使用确定性错误码。`--retry` 从最后持久化 checkpoint 继续；不实现复杂的自动重试或退避策略。

### Worker and checkpoint

worker CLI 形态为：

```text
bun run src/worker.ts --report <id> --step
bun run src/worker.ts --report <id> --retry
bun run src/worker.ts --report <id> --step --fail-at-segment <n>
```

pause 请求不会立即打断当前 segment，而在下一个 checkpoint 生效；resume 清除 pause 请求并继续推进。故障通过 `--fail-at-segment` 注入，不使用随机数或墙钟延迟。

会话沿用 staged 目录约定：初始请求在 `public/task.md`，约束补充在 `public/stage-2/task.md`。`first_implementation_checkpoint` 定义为：stage-2 follow-up 后，Agent 完成第一项兼容/回退相关代码变更、指定聚焦测试通过，并输出：

```text
CHECKPOINT: compatibility-slice-ready
```

#197 后续 runner 负责从同一 session trace 校验该标记、测试事件和 session continuity；#196 只固定公开脚本和事件契约。

### Baseline expectation

baseline 的 happy path 可以工作，但预期缺少或不完整处理：

- v1/v2 状态扩展的未知字段保留；
- 旧 worker 写回 v2 状态时的数据安全；
- rollback 遇到不兼容 schema 时的 fail-closed 行为；
- 失败后从最后 checkpoint 恢复而不丢失或静默重复进度。

这些是后续 #202 的行为 evaluator 责任；#196 不把实现目录、类名或 helper 名称作为验收条件。

## Candidate Layout and Privacy

使用：

```text
incubator/practice-injection/async-report-lifecycle-v1/
  public/
    task.md
    stage-2/task.md
    starter/app/
  private/
    candidate.yaml
    snapshot.json
```

Agent workspace 只由 public 任务和 starter 构成。candidate metadata 和 snapshot 留在 private；本 change 不创建 evaluator、oracle、calibration、scoring 或 Practice 正文。

## Validation and Lifecycle

候选验证包含黑盒 HTTP/持久化集成测试、snapshot verification、public/private leakage audit、`bun run validate` 和 `git diff --check`。验证不调用 candidate/Judge 模型，不创建 `results/records/`，不修改 active suite。若行为不能区分正确、表面正确和错误方案，candidate 保持 `candidate` 生命周期，不升级到 #197/#201 执行或 suite revision。

## Risks / Trade-offs

- [任务过于简单] → 保留真实的迁移窗口、旧新路径、checkpoint 状态和 rollback 状态；#202 使用 reference/equivalent/negative 行为夹具校准。
- [公开题面泄露 oracle] → 题面只写产品行为；兼容错误码和迁移策略以公开接口契约表达，但不写 hidden assertion、reference 目录或 Practice 文本。
- [检查点被 Agent 伪造] → checkpoint 必须同时有明确标记、stage-2 后的兼容性代码变更和聚焦测试事件；#197 再校验 trace。
- [原子写入或回退破坏状态] → 每个 report 独立文件、临时文件 rename、读取失败 fail closed，并测试原始状态未被覆盖。
- [candidate 误升级] → 保持 `lifecycle_stage: candidate`，不加入 suite manifest，不创建正式 record。
