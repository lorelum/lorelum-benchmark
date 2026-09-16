# AI Code Review Round 1（#199）

- 审查范围：`origin/main...0306a8c`
- 审查类型：`ai-code-review`
- 审查日期：2026-09-16
- 关联 Issue：#199
- 关联 PR：#215

## 结论

request changes。初轮审查发现 6 项契约/隔离问题和 1 项验证问题；在第二轮 review 前已全部修复。

## Findings 与修复

1. **must-fix：public delivery trace 暴露 Practice identity**
   - 依据：`AGENTS.md` 的 public/private 隔离和 OpenSpec 的 public trace redaction。
   - 证据：初始 `PublicDeliveryTrace` 序列化了 `practice_id` 与 `card_sha256`。
   - 修复：`06476c7` 将 Practice identity 移入 `private_trace`，`createAuditSidecar()` 只从 private delivery trace 建立审计；public trace 仅保留 treatment identity、node、condition 和 status。
   - 验证：contract/privacy tests 逐字段检查 public trace 不含 Practice ID、card hash，并对恶意附加字段执行负向审计。

2. **must-fix：packRoot 未受 isolated Store 约束**
   - 依据：OpenSpec 的 isolated Store 与 fail-closed source provenance 要求。
   - 证据：初始 adapter 只检查 source path 位于 `packRoot`，未验证 `packRoot` 位于 `storeRoot`。
   - 修复：`06476c7` 使用 `realpath` canonicalize Store、packRoot 和 source file，校验 packRoot/source file 均严格位于 isolated Store，并拒绝 symlink escape。
   - 验证：prepare tests 覆盖 Store 外 packRoot 与解析到 Store 外的 junction。

3. **must-fix：malformed Lore result/source entry 被静默过滤**
   - 依据：OpenSpec 的 malformed identity/provenance 必须 fail closed。
   - 证据：初始 parser 使用 `.filter(isRecord)`，并过滤无效 `techStack` 元素。
   - 修复：`06476c7` 改为逐元素严格解析；任意 malformed result/source 或非全字符串 tech stack 都拒绝整个响应。
   - 验证：contract tests 覆盖 malformed query result、source 和 tech stack。

4. **must-fix：runtime loader 未校验自身 treatment id/version**
   - 依据：`AGENTS.md` 的版本化 manifest/path identity 规则和 runtime contract fail-closed 要求。
   - 证据：初始 loader 依赖独立 workspace validator，未在自身边界校验 id/version。
   - 修复：`06476c7` 在 loader 内校验固定 id/version 的格式、allowlist 与 treatment directory basename。
   - 验证：contract test 修改 manifest id 后拒绝；loader 仍通过 `bun run validate`。

5. **must-fix：audit consistency 可被混合 condition 误判**
   - 依据：三 timing node 必须属于同一 condition、同一 treatment，且节点集合精确匹配声明集合。
   - 证据：初始 audit 只检查三个不同 node 及 Practice hash。
   - 修复：`06476c7` 的 audit 要求同一 condition、同一 treatment identity、正好 `timingNodes` 集合、三次均 delivered，并从 private trace 读取 identity。
   - 验证：contract tests 覆盖 mixed condition 与重复 node。

6. **should-fix：selection rank 未校验**
   - 依据：selection provenance 必须与冻结 query result set 一致。
   - 证据：初始 loader 仅检查目标 Practice 存在。
   - 修复：`06476c7` 根据结果数组重新计算 rank，并要求等于 `selection.query.selected_rank`。
   - 验证：tampered `selected_rank: 99` fixture 被拒绝。

7. **must-fix：PR diff whitespace 检查失败**
   - 依据：tasks 3.3 的 `git diff --check` 门禁。
   - 证据：初始 diff 在 `design.md` closing fence 后有 trailing whitespace，spec EOF 有额外空行。
   - 修复：`06476c7` 清理 whitespace 和 EOF。
   - 验证：`git diff origin/main...HEAD --check` 通过。

## 修复后的复核

- `openspec validate pack-sourced-practice-treatment --type change --strict --json`：通过。
- `bun run validate`：通过。
- `bun test src/benchmark/treatments/pack-practice/v1`：19 passed。
- `bun run test:contracts`：core 124 passed，runner 111 passed。
- `git diff origin/main...HEAD --check`：通过。
- 当前未执行真实 Lore CLI、网络/semantic model、Agent 模型运行、#201 九次探索、正式 record 或 suite promotion，符合生命周期门禁。

## 未覆盖范围

- 未审查 #197 staged runner 的后续消费实现；本 PR 未修改该 runner。
- 未执行真实运行与正式评测；本 change 仅冻结 treatment contract 和离线验证链路。

## 第二轮门禁

上述初轮 finding 均已在同一 Issue/OpenSpec/PR 内修复并由离线验证覆盖；第二轮 `thermo-nuclear-code-quality-review` 应仅针对 `06476c7` 之后的最新 diff 执行。

## 规则依据

- `AGENTS.md`：public/private 隔离、版本化 treatment、OpenSpec 生命周期、验证门禁和两轮 review 顺序。
- `docs/CHANGE_WORKFLOW.md`：review finding 留档、修复留在同一 change/PR、第二轮必须在第一轮 must-fix 清零后的最新 diff 上执行。
- `docs/PR_REVIEW.md`：两轮独立只读审查和规则依据映射。
- `schemas/pack-practice-treatment.schema.json`：固定 Pack identity、hash、delivery channel 和 applicability contract。
