## 1. OpenSpec 与规划门禁

- [ ] 1.1 对本 change 运行 strict validation 并创建仅含 OpenSpec artifacts 的初始 PR，关联 #161。
- [ ] 1.2 与需求方确认 7 项设计决策（形态、流式、计费口径、观测输出、Practice 粒度、无关对照、供应商集合），写回 issue #161 与 design.md Planning Confirmation。
- [ ] 1.3 草拟 `public/task.md` 并提交需求方审批；审批通过后生成 snapshot、进入校准与验证。

## 2. llm-provider-gateway-v1 [write scope: `incubator/practice-injection/llm-provider-gateway-v1/`]

- [ ] 2.1 经审批的 public task.md + 占位 starter（仅硬编码 OpenAI 直连路径，无抽象/无记账/无 `/api/usage`；公开 API 文档声明 chat JSON+SSE、usage 聚合、错误契约、config providers 注册表；公开语义测试基于本地 stub 服务器，无 `window.__` 埋点）。
- [ ] 2.2 private manifests（candidate/conditions/oracle，`judge.provider: judge-agent/generic/v1`、decision_rule joint-pass）、practices 规范文本（oracle `llm.provider-gateway` 单卡三建议 + irrelevant `backend.pagination` 分页约定，`project-convention/v1`、`target_path: docs/ai-gateway-guide.md`、±10%）、职责探针 `verify-provider-gateway.ts`、evaluator（evaluate + runtime-closure）、execution（tool-policy + git-history）。
- [ ] 2.3 calibration：新增后端基座 `incubator/calibration-bases/injection-calibration/v2/node-ts/app-shell/v1/`（参照 react-vite base 模式），sets.yaml + run.ts + overlays（candidate/reference/equivalent/anti-pattern/docs-present 负例）。
- [ ] 2.4 校准矩阵 5/5 通过（占位 fail/not-observed、reference pass/observed、equivalent pass/observed、anti-pattern pass/not-observed、文档在场负例 pass/not-observed）；通用 LLM judge（#153，显式 opt-in）判别力验证通过（reference 高分、anti-pattern 低分且拉开差距）。

## 3. 门禁与验证

- [ ] 3.1 生成并校验 snapshot（`bun run snapshot.ts --write` + `bun run validate` snapshots intact）；public/private 泄露审计 0 泄露。
- [ ] 3.2 `bun run validate`、OpenSpec strict validation、`git diff --check` 全绿，证据保留在实现 PR。
- [ ] 3.3 由独立 agent 在真实运行环境执行验证（starter 语义测试、校准矩阵、agent 视角真实性审计、泄露审计、结构完整性），输出独立报告并集成到实现 PR。
- [ ] 3.4 终检：现有 candidate/suite/treatments/历史结果未改动；未执行 Pi/agent 模型调用（judge 的 LLM 调用为显式 opt-in 校准）、未创建正式 record、未升级 suite revision。