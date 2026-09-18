# PR #218 独立上下文复核

- 审查对象：`69e31d851bd36e345719e2157e9885216b871b15`
- 审查范围：PR #218 的 benchmark contract、deterministic evaluator、行为夹具、OpenSpec change 与验证声明
- reviewer context：未参与实现的独立只读上下文，未继承实现线程、工具日志、失败尝试或作者解释
- 审查结论：未发现 must-fix；1 条隔离加固项与 2 条契约/可复现性 should-fix

## 第一轮（ai-code-review）findings

### F1 should-fix：条件元数据经继承环境进入被测应用

- 位置：
  - `incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/harness.ts:140`，server spawn 传入 `...globalThis.process.env`
  - `incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/harness.ts:199`，worker spawn 未显式设置 env，继承父进程
- 规则来源：delta spec Requirement “Evaluation is condition-blind and private”；`ai-code-review` 红线“baseline/oracle/retrieval/irrelevant 条件可比性”
- 证据：evaluator CLI 自身不读取条件输入，且 `cli.test.ts` 已证明不同 `PRACTICE_CONDITION`、`DELIVERY_NODE_ID` 和 `PRACTICE_ID` 下自身 JSON 相同；但 evaluator 把完整环境原样交给启动的 server 和 worker。若 #201 从带条件元数据的编排进程调用该 CLI，被测应用可读取这些变量并据此分支。
- 影响：削弱“同一 hard gate 适用全部 timing condition”的承诺。
- 修复方向：为 server 和 worker 显式构造最小环境，或剔除已知条件标识；补一条注入条件变量并断言被测应用看不到它们的回归测试。

### F2 should-fix：oracle 的逐检查 failure_reason 与实际输出 reason 脱节

- 位置：
  - `incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/oracle.yaml:3` 起，`checks.*.failure_reason`
  - `incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/identity.ts:173`，仅做解析校验
  - `incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/checks/compatibility.ts:36`，输出硬编码 reason
- 规则来源：`design.md` §4“oracle.yaml 把稳定 check id 映射到公开 requirement、fixture expectation 和失败类别”；thermo skill 对 dead logic 和装饰性契约的要求
- 证据：`oracle.checks` 解析后没有消费者，只有 `oracle.fixtures` 矩阵被 calibration 使用。实测 public-starter 的 overlap 与 rollback 都输出 `known-extension-field-dropped`，而 oracle 分别声明 `overlap-dropped-safe-state` 与 `rollback-corrupted-state`。
- 影响：声明的失败分类是装饰性的，reason 可静默漂移，#201/#200 无法依赖该分类。
- 修复方向：把 `oracle.checks[id].failure_reason` 接入输出 reason，或删除未消费字段并明确 reason 由 check 本地定义；补断言 emitted reason 属于 oracle 分类。

### F3 should-fix（低）：evaluator 自身 snapshot 使用 locale 相关排序

- 位置：
  - `incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/identity.ts:86`
  - `incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/identity.ts:90`
- 规则来源：`design.md` Goal“固定 evaluator/oracle/fixture/candidate snapshot 身份”和“CI/本地同一命令验证”；仓库 canonical `src/benchmark/snapshot.ts` 使用 code-point `.sort()`
- 证据：`localeCompare` 受 runtime ICU locale 影响。若生成 snapshot 的主机与运行 evaluator 的主机 locale 排序不同，`verifySnapshotFiles` 重算的 `snapshot_id` 可能不等，导致 `indeterminate`。当前 Windows 主机未复现差值，但这是 Linux CI 的潜在可移植性风险。
- 修复方向：改为 code-point 比较，与 `src/benchmark/snapshot.ts` 一致，并重新生成内层和外层 snapshot。
- 最小验证：`bun run generate-snapshot.ts`、`bun run snapshot --write`、`bun run validate`、完整 calibration。

## 第二轮（thermo）结论

无结构阻断项。`files.ts` 已收敛递归遍历/拷贝；`identity.ts` 283 行、`harness.ts` 233 行，远低于 1k；`evaluate.ts` 只做 CLI、编排和身份预检，判定在 `checks/`，结果构造在 `result.ts`；无 feature logic 渗入共享层、无 spaghetti 条件增长、无多余 wrapper/cast。唯一结构噪音是 F2 的 dead oracle 字段。F1-F3 处理或明确接受后满足 approval bar。

## 实测通过的验证（head 69e31d8）

- `bun run validate`：layout valid，snapshots intact
- 完整 calibration：12/12 fixtures 与 oracle 九检查矩阵一致
- focused tests：20 pass
- `cli.test.ts`：2 pass
- leakage audit：pass
- `evaluate.ts <public-starter>`：exit 1，且仅 overlap/rollback fail
- `openspec validate --strict`：valid
- `check:openspec-purpose`：0 changed stable specs
- #197 staged runner：24 pass
- `git diff --check`：clean
- `origin/main...pr-218`：仅新增 45 个文件，未改动 #196 candidate、#197 runner、#199/#200

## 未覆盖范围 / 假设

- PR 内两轮 review 留档均出自同一 change 作者；本报告是额外独立复核，不复用该上下文的结论。
- 无法从仓库验证“Plan mode 已获需求方确认”；tasks 1.4 已完成且 `design.md` 有 Confirmed Planning Decisions，按留档采信。
- 只在当前 Windows 环境运行 deterministic 检查，没有第二套 OS CI 证据，与 F3 相关。
- 本复核时 PR 仍为 draft，task 6.5 未勾选。
