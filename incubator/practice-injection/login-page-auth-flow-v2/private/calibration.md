# 校准记录（login-page-auth-flow-v2）

不调用模型。本 candidate 与 v1 的关键差异：starter 不预置领域翻译层（保留
`src/api/http.ts` 传输层，移除 `api/session.ts` 的 200/401→LoginResult 翻译），
`public/task.md` 不写「接口调用和错误处理放 api 那边」分层提示——baseline（无注入）
在 v2 judge 上存在可观测缺口。Practice 以「项目内规范」形态经
`injection-calibration/v2`（delivery template `project-convention/v1`）条件写入
workspace 的 `docs/frontend-guide.md`（仅 oracle/irrelevant 可见）。

## 语义 + 分层矩阵（quality-probe/v2）

通过 kernel 运行
`bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/login-page-auth-flow-v2 --output <已 materialize 的临时 workspace>`
可重放。矩阵要求：public-starter `semantic=fail / not-observed`；reference、
equivalent（自建领域边界）`semantic=pass / observed`；anti-pattern（组件直连
transport 读取原始响应）`semantic=pass / not-observed`。本地实测（2026-08-05）：
4/4 匹配（public-starter fail/not-observed；reference pass/observed；equivalent
pass/observed；anti-pattern pass/not-observed）。Playwright 语义测试在 Vite dev
server 上经 `page.route` 拦截 `/api/session`。

## Judge v2 校准（login-page-judge/v2，focused set）

v2 judge（复用 #144，共享 helper 位于 `src/benchmark/judge/practice-layered-api/v2/`）在 v2 starter 形态上的
focused 校准：reference（自建领域边界）100/100、equivalent（不同命名/结构的自建
边界）100/100、anti-pattern（组件直连 transport）0/100，criterion 方向断言通过。
`bun test private/judge/v2/judge.test.ts` 26 pass / 0 fail。

## v2 离线缺口验证（复测前置门禁）

用 v2 judge 离线重评构造样例（基于 v2 starter SourceMap）：
- baseline-direct-transport（组件直接 await http.ts 并读原始 status/body）→ **0/100**
  （四项 criterion 全 0）。
- oracle-self-built-boundary（自建领域边界翻译 200/401）→ **100/100**（30/25/30/15）。

结论：task 已具备判别力（baseline 存在缺口、oracle 能补上），ceiling 已消除。
本 candidate 不创建正式 record、不调用模型；复测 pilot 为后续独立计划。
