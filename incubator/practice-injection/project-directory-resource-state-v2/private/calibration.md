# 校准记录（project-directory-resource-state-v2）

不调用模型（探针/矩阵）；judge 判别力校准为显式 opt-in 的真实 LLM 调用。本 candidate 与 v1 的关键差异：
starter 为真占位（未接加载/搜索/空/失败/重试状态），公开测试经 `page.route` 拦截 `/api/projects`（产品内无
`window.__` 埋点）；`public/task.md` 以真实工单口吻声明可观察行为并保留自然语言基本分层提示。Practice 以
「项目内规范」形态经 `injection-calibration/v2`（delivery template `project-convention/v1`）条件写入
workspace 的 `docs/frontend-guide.md`（仅 oracle/irrelevant 可见）。

## 语义 + 探针矩阵（quality-probe/v1）

通过 kernel 运行
`bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/project-directory-resource-state-v2 --output <已 materialize 的临时 workspace>`
可重放。矩阵要求：public-starter `semantic=fail / not-observed`；reference、equivalent（自建查询边界）
`semantic=pass / observed`；anti-pattern（组件直连 transport 读取原始响应）`semantic=pass / not-observed`。
Playwright 语义测试在 Vite dev server 上经 `page.route` 拦截 `/api/projects`。

## Judge 判别力校准（judge-agent/generic/v1，显式 opt-in）

`LORELUM_JUDGE_REAL=1` + `LORELUM_CALIBRATION_SET_KEY=quality-probe/v1` +
`LORELUM_CALIBRATION_FIXTURES=reference,equivalent,anti-pattern` 下运行
`src/benchmark/judge/judge-agent/generic/v1/calibrate.ts`；结果写入 PR #152。
v2 夹具复验（2026-08-06，deepseek-v4-flash，每夹具 3 次取样取中位数）：reference 100 / equivalent 96 / anti-pattern 40（gap 60）→ **passed=true**。
judge 增强同 profile-update v2（工程质量规范 + 严格证据打分 + 重复取样中位数 + 阈值重校准）。确定性探针矩阵 4/4 通过。
## 修订记录（2026-08-08，纳入 #91 change 的 v2 执行前修订）

- 每 attempt 预算 10 → 25 分钟（deepseek-v4-pro 较慢）。
- 探针领域翻译/资源状态检查改为结构化（接受 taken/409/type-kind-outcome 判别词），修复 review N5 词法耦合误判；探针矩阵重校准仍 4/4（reference/equiv observed、anti-pattern not-observed、public-starter not-observed）。
- snapshot 已重生成（身份变更），执行结果见 #91 的 scratch（v2-full-run / v2-rerun-pdir）。