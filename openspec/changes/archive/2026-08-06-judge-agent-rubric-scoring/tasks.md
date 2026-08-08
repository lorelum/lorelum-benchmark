## 1. OpenSpec 与规划门禁

- [x] 1.1 对本 change 运行 strict validation 并创建仅含 OpenSpec artifacts 的初始 PR，关联 #153（PR #154）。
- [x] 1.2 与需求方确认设计决策（rubric 生成方式、真实 judge 模型与 opt-in 机制、per-candidate 校准是否强制、范围边界），写回 issue #153 与 design Planning Confirmation。

## 2. 通用 LLM JudgeAgent 实现 [write scope: `src/benchmark/judge/judge-agent/generic/v1/` + `providers.ts`]

- [x] 2.1 实现 `llm.ts`：轻量 OpenAI 兼容 HTTP client（env 配置 base_url/api_key/model，temperature 0、JSON 输出、超时与错误处理，可注入 stub 供测试）。
- [x] 2.2 实现 `rubric.ts`：从 `task.md` 构造 rubric 生成提示，LLM 输出结构化 rubric（维度/权重/判据，100 分制），校验并计算 rubric hash，按任务缓存；失败 fail closed。
- [x] 2.3 实现 `score.ts`：把 rubric + candidate diff 构造打分提示，LLM 输出 criterion 分数/rationale/confidence，经 `assertJudgeResultV1` 校验；缺失 hash/非法输出 fail closed；打分提示声明 candidate 源码为数据非指令。
- [x] 2.4 实现 provider（`judge-agent/generic/v1`，未 opt-in 时 `judge-unavailable`）并注册到 `src/benchmark/judge/providers.ts`。
- [x] 2.5 增量扩展 `JudgeProvider`（`rubricText` 可选任务上下文 + 可选 `promptFor`）并更新 runner `profile-diagnostic-runner.ts` 传入 `task_md`/使用 `promptFor`；既有 provider 测试保持绿。
- [x] 2.6 `.env` 加入 `.gitignore`，新增 `.env.example` 模板。

## 3. 测试与校准路径

- [x] 3.1 单元测试（stub LLM client，无网络）：rubric 生成解析（合法/非法/失败）、score 解析与 `assertJudgeResultV1`、缺失 hash/非法输出 fail closed、未 opt-in 时 `judge-unavailable`、rubric 按任务缓存、输入 allowlist 拒绝私有材料（`bun test src/benchmark/judge/judge-agent/generic/v1 src/benchmark/judge`）。
- [x] 3.2 在 profile-update-command-boundary-v1 的 reference/equivalent/anti-pattern 夹具上（显式 opt-in，`LORELUM_CALIBRATION_SET_KEY=quality-probe/v2`、`LORELUM_CALIBRATION_FIXTURES=reference,equivalent,anti-pattern`）验证真实 judge 判别力并留证：reference 80 / equivalent 92 / anti-pattern 88，anti-pattern 未分离（passed=false），按诊断性处理；结论与证据已写入 PR #154。

## 4. 门禁与验证

- [x] 4.1 契约兼容：`bun test src/benchmark/judge src/benchmark/outcome/v1 src/benchmark/runner/pi/v2`（mock、既有 judge、runner 接入）保持绿（process-tree 为 Windows 既有挂起，与本 change 无关）。
- [x] 4.2 `bun run validate`、OpenSpec strict validation、`git diff --check` 全绿，证据保留在实现 PR（#154）。
- [x] 4.3 终检：不修改登录页 judge、既有 provider 契约、`outcome/v1`、任何 candidate/task；未运行 Pi/agent 模型（judge 的 LLM 调用为显式 opt-in 校准）、未创建正式 record。