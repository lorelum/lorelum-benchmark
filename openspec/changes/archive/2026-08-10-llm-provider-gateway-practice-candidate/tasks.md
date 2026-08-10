## 1. OpenSpec 与规划门禁

- [x] 1.1 对本 change 运行 strict validation 并创建仅含 OpenSpec artifacts 的初始 PR（#162），关联 #161。
- [x] 1.2 与需求方确认 7 项设计决策（形态、流式、计费口径、观测输出、Practice 粒度、无关对照、供应商集合），写回 issue #161 与 design.md Planning Confirmation。
- [x] 1.3 `public/task.md` 草稿经多轮打磨（真人工单口吻、去实现泄底、去文件路径）并经需求方放行进入 pilot（2026-08-10），视为审批通过。

## 2. llm-provider-gateway-v1 [write scope: `incubator/practice-injection/llm-provider-gateway-v1/`]

- [x] 2.1 public task.md（真实工单口吻）+ 占位 starter（仅硬编码 OpenAI 直连路径，无抽象/无记账/无 `/api/usage`；`docs/gateway-api.md` 声明 chat JSON+SSE、usage 聚合、错误契约、config providers 注册表；公开语义测试基于本地 stub 服务器，无 `window.__` 埋点）。
- [x] 2.2 private manifests（candidate/conditions/oracle，`judge.provider: judge-agent/generic/v1`、decision_rule joint-pass）、practices 规范文本（oracle `llm.provider-gateway` 单卡三建议 + irrelevant `backend.pagination` 分页约定，`project-convention/v1`、`target_path: docs/ai-gateway-guide.md`、±10%）、职责探针 `verify-provider-gateway.ts`、evaluator（evaluate + runtime-closure）、execution（tool-policy + git-history）。
- [x] 2.3 calibration：新增后端基座 `incubator/calibration-bases/injection-calibration/v2/node-ts/app-shell/v1/`（含 base.yaml + source，`materializer_kind: node-ts`）、`node-ts/v1` materializer（注册到 kernel/snapshot）、sets.yaml + run.ts + overlays（candidate/reference/equivalent/anti-pattern/docs-present）。
- [x] 2.4 校准矩阵 5/5 通过（public-starter fail/not-observed；reference pass/observed；equivalent pass/observed；anti-pattern pass/not-observed；docs-present pass/not-observed），证据见 `private/calibration.md` 与独立验证报告。
- [ ] 2.5 通用 LLM judge（#153 `judge-agent/generic/v1`）判别力校准未执行：需要 `LORELUM_JUDGE_REAL=1` 显式 opt-in 与 DeepSeek API Key，本 change 不默认调用模型；重放命令见 `private/calibration.md`（pilot 阶段 judge 已作为 soft signal 实际运行 15 个 attempt，见 pilot change `llm-provider-gateway-pilot-diagnostic`）。

## 3. 门禁与验证

- [x] 3.1 生成并校验 snapshot（`bun run src/benchmark/snapshot.ts --incubator --write` + `bun run validate` snapshots intact，含 `private/calibration.md`）；public/private 泄露审计 0 命中（公开面无 benchmark/oracle/evaluator/calibration/practice 术语，无 `docs/ai-gateway-guide.md`，无 private 文件）。
- [x] 3.2 `bun run validate` 通过、OpenSpec strict validation 通过、`git diff --check` 通过。
- [x] 3.3 独立 agent 真实环境验证完成并集成：`openspec/changes/llm-provider-gateway-practice-candidate/verification/independent-report.md`（starter 语义 0/10 失败按设计、reference 10/10 通过、校准矩阵 5/5、真实性审计 0 泄露、结构完整性通过；发现并修复 snapshot 未含 `private/calibration.md` 的问题）。
- [x] 3.4 终检：现有 candidate/suite/treatments/历史结果未改动（本 change 只新增 candidate + 后端校准基座 + `node-ts/v1` materializer 注册）；未执行 Pi/agent 模型调用（judge 的 LLM 调用为显式 opt-in，未执行）、未创建正式 record、未升级 suite revision。