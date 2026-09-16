## Why

Issue #197（https://github.com/lorelum/lorelum-benchmark/issues/197）需要为 P1 异步报表时机实验提供可审计的三阶段 Practice 投放协议。现有 Pi v2 staged runner 只能在预设阶段开始前注入内容，无法在同一会话中区分任务开始、约束补充送达后、首个实现检查点完成后三个 delivery nodes；如果通过重启会话、墙钟延迟或运行中重新 query 来模拟时机，结果就不再只反映 delivery node。

#196 已冻结公开 candidate/starter 和 `first_implementation_checkpoint` 语义，#199 已冻结 Pack-sourced `practice-card` treatment（`agentic-coding-replan-on-material-drift/v1`）。现在只需要把这个固定输入安全地交给 runner，并保存可验证的私有 delivery trace。

## What Changes

- 为 Pi v2 staged runner 增加 v1 三节点 delivery contract：`task_start`、`constraint_followup`、`first_implementation_checkpoint`。
- 要求三节点在同一 Agent session 内按预声明顺序执行；runner 不重启会话、不使用墙钟等待或任意 token 数伪造时机。
- 消费 #199 的固定 Pack ref、Practice ID、正文 hash 和 delivery metadata；runner 不执行 Lore query、重排或自动触发判断。
- 为 baseline 和未声明 treatment condition 增加 fail-closed isolation；只有声明了 treatment 的 timing condition 才能收到 Practice card。
- 增加私有 delivery audit trace 和面向 Agent/public 的脱敏 trace，记录 session、stage、condition、treatment identity、Pack provenance、Practice hash 与 delivery outcome，同时禁止 Practice 正文、private 路径、evaluator/oracle/scoring 泄露。
- 增加 mock/fixture contract tests，覆盖阶段顺序、同会话连续性、固定 hash、投放失败、unsupported/indeterminate 和 baseline isolation；CI 不调用模型。

## Capabilities

### New Capabilities

- `staged-practice-delivery`: 定义 Pi v2 staged runner 在同一会话内按三个预声明节点投放固定 Practice card、隔离未声明 condition，并输出可审计 delivery trace 的契约。

### Modified Capabilities

无。现有 `profile-diagnostic-runner` 和既有 staged 诊断的历史语义保持不变；本 change 新增异步报表 timing delivery 的专用能力，不改写已有 frozen helper 或结果。

## Impact

- 预计修改 `src/benchmark/runner/pi/v2/staged/` 的 plan、adapter、driver 和测试，并新增 versioned delivery contract/schema（如实现确认需要）。
- 运行输入来自 #199 已冻结的 private treatment manifest；`lore` 解析只存在于 treatment preparation，不进入 runner delivery path。
- #196 candidate、public task/starter、evaluator（#202）、JudgeAgent（#200）、suite revision 和正式 record 不在本 change 内修改或创建。
- 初始 PR 仅包含本 OpenSpec change artifacts；strict validation 和初始 PR 完成后，按仓库规则先进行规划澄清，再开始 runner 代码或 fixture 实现。