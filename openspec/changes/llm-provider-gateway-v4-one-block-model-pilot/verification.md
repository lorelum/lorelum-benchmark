# Verification

## Preflight（2026-09-01，run id `v4-one-block-preflight-r3`）

全部 6 项通过，`probe_model_calls: 1`（endpoint 探活）：

- candidate-identity：snapshot `a4836afcb2fd…`、profile input `7699abf7d8eb…`、commit `1b36016a6ba4…`，offline calibration qualified 且记录 0 模型调用
- pi-version：0.80.10（与 conditions.yaml 一致）
- credential-present：credential 存在（值未记录；通过 `.env` 内部网关 + `configureLocalPiModelCatalog` baseUrl 覆盖）
- endpoint-probe：模型探活成功（`LORELUM_LOCAL_EXPERIMENT=1` + local catalog override 后通过；直接走公开 DeepSeek endpoint 会 401）
- timeout-termination：挂起子进程在预算内被终止
- dry-run-three-conditions：三条件计划物化、leakage audit 0 命中、zero model calls

其余门禁：focused staged tests 15/15、`bun run test:contracts` 216/216、`bun run validate` 通过、OpenSpec strict 通过、protected-path（workspace layout/snapshot）通过、credential/endpoint 审计（新增文件仅引用环境变量名，无 secret）、`git diff --check` 通过。

## One-block 执行（run id `v4-one-block-2026-09-01`）

schedule_seed `llm-provider-gateway-v4-one-block-model-pilot/v1`，cyclic-latin-square/v1，3 attempts：

| attempt | condition | health | session | stage1 | stage2 | structure |
|---|---|---|---|---|---|---|
| 01 | oracle-practice | evaluated | same-session | pass | pass | 9/9 checks pass, structure_pass=true |
| 02 | irrelevant-practice | evaluated | same-session | fail | not-run | 未进入（stage-1-semantic 终止） |
| 03 | baseline | execution-unhealthy | not-started | not-run | not-run | pi-execution：Stage 1 超过 900000ms 预算被终止 |

- oracle-practice raw metrics：changed_production_files=2, changed_declarations=2, handler=1, policy=0, ledger=1, transport=1, deleted=0, replaced=1, normalized_changed_ast_nodes=185, maximum_single_file_edit_share=0.5
- baseline 超时原因：模型在 Stage 1 中生成/重写大型 lockfile 内容，未在 15 分钟内 settle；进程树已终止，无残留进程
- transcript/run workspace 位于 `scratch/llm-provider-gateway-v4-model-pilot/v4-one-block-2026-09-01/`（git ignored，约 816MB，可在审阅后删除）
- 未调用 judge model；未重跑任何 attempt；3/3 attempts 保留在 planned denominator

结论边界：one-block diagnostic smoke；不构成 directional-screen、Practice effect 或正式 benchmark 结论。
