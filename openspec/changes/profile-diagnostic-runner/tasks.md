## 0. 规划澄清门禁

- [x] 0.1 确认 D1 重复次数：执行器首版固定使用 conditions.yaml 声明的 `repetitions` 值，
  不接受 `--repeat` 覆盖；与 #91 "不少于三次" 的扩大阶段区分。结论写回 design 与本清单。
- [x] 0.2 确认 D2 模型与环境：首版固定使用 conditions.yaml 声明的
  `deepseek/deepseek-v4-pro` + 本地 Pi（`LORELUM_LOCAL_EXPERIMENT=1`），不支持多模型。
- [x] 0.3 确认 D3 candidate 发现方式：执行器接受显式 candidate 路径列表，不自动扫描
  `incubator/practice-injection/`。
- [x] 0.4 确认 D4 preflight 复用：从旧 `run-local.ts` 提取 `preflightModel` 为共享
  helper `preflightPiAndModel`，供新执行器与 `run-local.ts` 共同复用，不改变
  `run-local.ts` 行为或其 snapshot 覆盖范围。
- [x] 0.5 确认 D5 模型实跑：当前环境支持真实 Pi + 模型调用，执行器首版即支持真跑并
  产出真实诊断结果；不先做 dry-run-only 交付。
- [x] 0.6 确认 D6 成功标准：#90 的成功标准是执行器流程跑通、产物格式正确、隐私边界
  无泄露；方向性信号的有无属于 #92 汇总职责，不作为 #90 交付门槛。
- [x] 0.7 确认 D7 区分度预期：信任 #89 已有校准，不干预 baseline_expected_result 预期；
  若实际跑出 baseline practice_probe 也通过，如实记录为"无区分度"诊断。
- [x] 0.8 确认 D8 预算与盲评：单次执行预算用 conditions.yaml 声明的 10 分钟/次；#90
  不做盲评（盲评属于正式流程）。
- [x] 0.9 确认 D9 后续去向：#90 诊断结果产出后先与需求方一起看，再决定进 #91 扩样本
  还是调整 candidate/卡片设计；不自动衔接 #91。

## 1. 输入身份验证与 preflight

- [x] 1.1 实现 candidate 声明校验：读 `private/candidate.yaml`，校验 `kernel.core`、
  `kernel.profile`、`kernel.materializer_kind` 符合 `injection-calibration/v1` 契约；
  拒绝非该 profile 的 candidate。
- [x] 1.2 实现输入身份验证：读 `private/snapshot.json`，校验 `snapshot_id`、
  `resolved.profile_input_hash`、`source.source_commit` 三者自洽，并与
  `resolveInjectionCalibration` 返回的 `profile_input_hash` 比对一致；失败时标记
  `not-executable`，不创建工作区、不请求模型。
- [x] 1.3 提取 #94 preflight 逻辑为共享 helper `preflightPiAndModel(command, modelId)`：
  `pi --version` + `pi --print --no-session --model <id> ok`（30s 短超时）；失败
  fail-closed，不进入执行循环；不修改 `run-local.ts` 行为。
- [x] 1.4 为身份校验失败、preflight 失败写 focused tests，断言均 fail-closed 且不创建
  workspace。

## 2. Condition-specific 执行循环

- [x] 2.1 实现 clean-copy workspace 创建：复制 `public/starter` + `public/task.md` 到
  临时 workspace，assert 无 `private/` 或 `practices/` 文件。
- [x] 2.2 集成 `resolvePracticePayload`：baseline 返回的 payload 无 `practice` 字段
  （结构性保证），oracle/irrelevant 返回含 `text` 的内存载荷。
- [x] 2.3 实现 Pi 调用：base args + `--append-system-prompt <practiceText>`（仅当
  `payload.practice` 存在）；baseline 不加该参数。
- [x] 2.4 实现 evaluator 调用与结果收集：语义结果 + 质量 probe。
- [x] 2.5 为 baseline 无 payload、resolver 调用顺序、条件范围写 focused tests。

## 3. 脱敏 trace 与诊断产物

- [x] 3.1 用 `redactedInjectionTrace` 生成每条结果的 trace，只记录 `condition_id`、
  channel、Practice ID/version/SHA-256、`profile_input_hash`。
- [x] 3.2 在 `scratch/` 下按 candidate × condition × repeat 组织诊断产物
  （pi.stdout/stderr、candidate.diff、evaluator.stdout、trace.json）。
- [x] 3.3 生成脱敏 summary（`profile-diagnostic-summary/v1`），按 candidate ×
  profile_input 分组，不跨 input 相加。
- [x] 3.4 为脱敏 trace、workspace 无 Practice 文本、summary 无私有路径写泄露审计
  focused tests。

## 4. 异常隔离与验证

- [x] 4.1 实现异常隔离：单个 candidate/condition/repeat 失败时记录 entry 并 continue，
  不中断整批；starter/snapshot/evaluator 问题标 `not-executable`。
- [x] 4.2 为异常隔离写 focused test：注入一个坏 candidate，断言其他 candidate 继续。
- [x] 4.3 执行 public/private 泄露审计、focused tests、`bun run validate`、OpenSpec
  strict validation 与 `git diff --check`；记录结果及未执行的 Pi、模型、retrieval、
  盲评与正式 record。
