## Why

现有 Practice candidate 的打分制评分依赖 per-candidate 手写确定性静态 judge（如登录页 `practice-layered-api/v2`），每个 candidate 都要维护整套 `score.ts`/`rubric.ts`/`calibrate.ts`/`judge.test.ts`（约 300–500 行），专属且不可复用；#151 的两个 v2 candidate 需要打分制评分，不应重复造轮子。本 change 建立仓库级通用 LLM JudgeAgent：LLM 读需求生成评分标准，再按标准打分，可复用于仓库内任意 candidate。

## What Changes

- 新增 `src/benchmark/judge/judge-agent/generic/v1/`：`llm.ts`（轻量 OpenAI 兼容 HTTP client）、`rubric.ts`（LLM 从 `task.md` 与声明的公开材料生成评分标准 rubric：维度/权重/判据，校验并 hash，按任务缓存）、`score.ts`（LLM 按 rubric 对 candidate diff 打分，产出 `judge-result/v1`）、`provider.ts`、`calibrate.ts`、单元测试；在 `src/benchmark/judge/providers.ts` 注册 `judge-agent/generic/v1`。
- 复用 #133 已建地基：provider 接口、输入 allowlist/脱敏（只收公开 task/starter/candidate diff）、provenance（prompt/rubric/input hash）、mock provider（CI/本地默认不调模型）、真实 provider 显式 opt-in 且不在 CI 执行。
- 增量扩展 `JudgeProvider`：`rubricText` 增加可选任务上下文参数、provider 可提供可选 `promptFor(input)`；向后兼容，不改写既有 provider 与 `outcome/v1` 契约。
- API 地址/key 经仓库根目录 `.env` 配置（`LORELUM_JUDGE_REAL` / `BASE_URL` / `API_KEY` / `MODEL`）；`.env` 加入 .gitignore，提交 `.env.example` 模板。
- 提供 per-candidate 判别力校准路径：reference / equivalent / anti-pattern 夹具上验证通用 judge 能区分（oracle 高分、anti-pattern 低分且与 reference 拉开差距）。
- 不改写登录页确定性 judge（`practice-layered-api/v2`）与既有 runner 契约。

## Capabilities

### New Capabilities

- `judge-agent-rubric-scoring`: 仓库级通用 LLM JudgeAgent 能力——LLM 读公开任务生成评分标准（rubric），再按 rubric 对 candidate 打分，产出带 provenance 的 `judge-result/v1`；输入只含公开材料并 fail closed；CI/本地默认 mock、真实 provider 显式 opt-in；per-candidate 校准夹具验证判别力；judge 仅为软质量信号。

### Modified Capabilities

- 无（#133 `judgeagent-soft-scoring` 已定义通用契约与 opt-in 框架，本 change 在其上落地具体实现）。

## Impact

- Judge：`src/benchmark/judge/judge-agent/generic/v1/`（llm/rubric/score/provider/calibrate/judge.test）与 `src/benchmark/judge/providers.ts` 注册。
- 消费方：#151 两个 v2 candidate 声明 `judge.provider: judge-agent/generic/v1`（后续实现）。
- 不改写：`practice-layered-api/v2`、provider 契约、`outcome/v1`、runner judge 接入。
- 不创建正式 record、不运行 Pi/agent 模型、不修改任何 candidate/task。