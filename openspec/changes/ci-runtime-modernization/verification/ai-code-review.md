# 第一轮审查：ai-code-review

审查日期：2026-09-15
审查范围：`origin/main...codex/ci-runtime-modernization` 的最终实现 diff（Issue #212 / PR #213）。
审查依据：根目录 `AGENTS.md`、`ai-code-review` skill、CI 运行记录和相关 runtime/snapshot/runner 契约。

## 处置记录

- **must-fix，已修复：CI 路径门禁遗漏。** `runner-integration` 的路径集合原先没有覆盖其独立启动脚本 `scripts/run-runner-contracts.ts`，也没有覆盖 `validate.yml` 自身；只修改集成编排或 runner 测试启动器时可能跳过被修改的集成门禁。现已将两者加入 runner filter，并在设计记录中写明该边界。
- **should-fix，已修复：新增 snapshot 回归测试没有接入 CI。** `src/benchmark/snapshot.test.ts` 原先未被 `test:contracts:core` 调用，跨平台换行行为只能依靠本地验证。现已把该测试加入 `test:contracts:core`。
- **should-fix，已修复：无用 import。** snapshot digest 改为专用实现后，`src/benchmark/snapshot.ts` 的 `sha256File` import 已删除。
- **should-fix，已修复：文档与 manifest 不一致。** `environments/README.md` 已明确 `local-pi/v2` 是当前本地启动配置，`local-pi/v1` 为 legacy；design.md 已改为准确描述 `engines.node` 的 exact pin。

## 最终结论

未发现仍需修改的 must-fix。变更未把 private evaluator/oracle/scoring、模型调用、正式 record 或 suite promotion 带入本 PR；历史 incubator condition pins 未改写。CI 保留原有测试逻辑，仅调整事件去重、路径相关性、超时边界和失败 artifact。

## 规则到证据映射

| 规则 | 证据 |
| --- | --- |
| public/private 隔离与生命周期 | PR diff 无 `suites/`、`results/records/`、模型运行或 private material 注入；OpenSpec non-goals 和 PR body 明确边界 |
| benchmark/runtime 改动需可验证 | `bun run validate`、`bun run validate:openspec`、runtime manifest check、CI exact-version assertions |
| 不删除有价值的 CI 测试逻辑 | `test:contracts:runner`、formal-container、realistic-repository 仍保留；仅拆分 job、加 timeout 和路径触发 |
| 可复现 runtime | package/lockfile、active environment manifests、formal image digest 和 CI assertions 使用同一版本身份 |
| 跨平台 snapshot 稳定性 | v1 text canonicalization 与 binary/invalid UTF-8、v2 byte-level 行为的 focused tests |

验证：PR CI run `34966364584` 的所有 jobs 通过；本地 core contracts `118 pass`、runner contracts `110 pass`、`bun run validate` 和 strict OpenSpec validation 通过。
