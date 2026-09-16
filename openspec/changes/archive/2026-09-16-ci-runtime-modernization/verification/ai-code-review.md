# 第一轮审查：ai-code-review

审查日期：2026-09-15
审查范围：`origin/main...codex/ci-runtime-modernization` 的最终实现 diff（Issue #212 / PR #213），包含对第一次 review request changes 的修复。
审查依据：根目录 `AGENTS.md`、`ai-code-review` skill、CI 运行记录和相关 runtime/snapshot/runner 契约。

## Review request changes 处置

- **must-fix，已修复：v2 snapshot 误用 v1 换行规范化。** 验证路径现在先读取已存储 snapshot 的 version；v1 使用文本 canonicalization，v2 始终使用 raw-byte file digest。新增 CRLF v2 snapshot 通过普通验证路径的回归测试。
- **must-fix，已修复：runtime upgrade 破坏 staged candidate identity。** 原有 formal `v1`、`local-pi/v2`、`local-wsl-pi/v2` manifest 保持旧 runtime identity；新 runtime 写入 `formal-pi-deepseek-v4-pro/v2`、`local-pi/v3`、`local-wsl-pi/v3`。现有 `llm-provider-gateway-v4` condition 不被静默改写；后续迁移须显式创建 candidate/plan migration。容器 version assertion 改为从所选 environment 读取，旧 environment 仍有一致的检查契约。
- **must-fix，已修复：realistic calibration path filter 不完整。** path classifier 现在覆盖 `evaluate.ts`、`snapshot.ts`、`fs.ts`、`task-discovery.ts`、`evaluator/**` 等实际执行依赖，并由 `scripts/ci-change-classifier.test.ts` 覆盖。
- **should-fix，已修复：binary detection 只有 NUL heuristic。** v1 digest 现在对 valid UTF-8 control-heavy payload 按 binary 处理；新增 `[0x01, 0x0d, 0x02]` 回归测试，确保原始字节不变。
- **needs-discussion，已处理：path-gated job 与 branch protection。** 新增始终执行的 `required-validation` 聚合 check：快速 job 必须成功，重型 job 可为成功或有意 skipped。仓库 token 无法读取 branch-protection API（branch protection endpoint 返回 404），因此 PR body 明确要求维护者将稳定聚合 check 绑定到 branch protection，并保留现有 check-name 迁移说明。

## 最终结论

未发现仍需修改的 must-fix。变更未把 private evaluator/oracle/scoring、模型调用、正式 record 或 suite promotion 带入本 PR；历史 incubator condition pins 和已有 environment identity 未被改写。CI 保留原有测试逻辑，仅调整事件去重、路径相关性、超时边界、版本选择和失败 artifact。

## 规则到证据映射

| 规则 | 证据 |
| --- | --- |
| public/private 隔离与生命周期 | PR diff 无 `suites/`、`results/records/`、模型运行或 private material 注入；旧 environment/condition identity 保持不变 |
| benchmark/runtime 改动需可验证 | `bun run validate`、`bun run validate:openspec`、runtime manifest check、CI exact-version assertions |
| 不删除有价值的 CI 测试逻辑 | `test:contracts:runner`、formal-container、realistic-repository 仍保留；仅拆分 job、加 timeout 和路径触发 |
| 可复现 runtime 与版本化环境 | 新 environment versions 使用同一 runtime/lockfile/image identity；旧版本保留原值 |
| snapshot/runner 契约隔离 | 存储 snapshot version 决定 digest policy；container version assertion 从所选 environment 读取 |
| CI 触发边界可审计 | `scripts/ci-change-classifier.ts` 集中维护三类路径，`ci-change-classifier.test.ts` 覆盖 realistic 依赖、runner harness、classifier self-change 和 docs-only |

验证：本地 snapshot/runner/sandbox/core focused tests 全部通过；`bun run validate`、strict OpenSpec validation、`git diff --check` 通过。修复后 CI run `34973115602` 的全部 jobs 通过。
