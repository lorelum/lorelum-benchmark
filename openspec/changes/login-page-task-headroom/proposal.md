## Why

#137 诊断 pilot 与 v2 重评（PR #144）显示登录页 candidate 存在两个叠加的有效性问题：① task 无头部空间（starter 预置完整分层，baseline 无注入即 v2 100/100，三条件同分，测不出精准注入效果）；② 环境真实感不足（Practice 以「练习卡」注入、starter 无工程历史，agent 可能识别出测试环境导致行为失真）。复测要可信，需新建 candidate revision 同时制造可观测缺口并提升环境真实性与隐蔽性。

## What Changes

- 在 `incubator/practice-injection/` 新建登录页 candidate 下一 revision（`login-page-auth-flow-v2`，不改写 `login-page-auth-flow-v1` 或历史结果）。
- starter 不预置领域翻译层（保留 `api/http.ts` 传输层，移除/降级 `api/session.ts` 的 200/401→LoginResult 翻译），task.md 保持真实工单口吻且不再写「接口调用和错误处理放 api 那边」这类分层提示 → baseline 无注入时存在 Practice 缺口。
- Practice 注入去卡片化：以「项目内既有规范」（如 `docs/frontend-guide.md` 的「前端分层约定」小节）**条件注入**，仅 oracle-practice 条件可见；baseline / irrelevant 不可见。
- starter 带 git 历史与真实工程上下文（加入已有项目的观感）；工作区与 prompt 不出现测试痕迹（无评分/hash/condition/评测字样）。
- 真实性审计为**事后被动**：运行结束后由评测方读 trace 统计 agent 是否自发识别测试环境；不向 agent 提问、不暴露测试意图、不影响评分。
- 用 v2（已合并 #144）离线验证缺口：baseline v2 score < 100（或 practice_observation=not-observed），oracle 条件能补上。
- 不进入默认 suite，不创建正式 record；通过后由独立复测 pilot 计划承接。

## Capabilities

### New Capabilities

- `login-page-task-headroom`: 定义登录页 candidate 下一 revision 的题面、starter（制造 Practice 缺口 + 环境真实化）、隐蔽条件注入与事后被动真实性审计、复测前置门禁。

### Modified Capabilities

- `practice-benchmark-boundaries`: 补充候选环境不得暴露测试痕迹、Practice 注入须条件化并以项目内规范呈现、真实性检测为事后被动等要求。

## Impact

- Candidate：`incubator/practice-injection/login-page-auth-flow-v2/`（public/private、starter + git 历史、conditions/oracle/evaluator、calibration、snapshot）。
- 评测：复用 v2 judge（#144 已合并）与 `verify-layering.ts`，按新 starter 形态校准。
- 范围：#145。不修改 `login-page-auth-flow-v1` 或历史结果；不实现 runner judge provider（#146）；不执行正式 benchmark；不创建正式 record。
