# 校准记录

不调用模型。public starter 为真占位（表单未接通、无提交处理），公开语义必须
`fail` 且分层质量信号 `not-observed`；anti-pattern（组件直接调用 transport 并读取
原始 response）公开语义 `pass`、分层 `not-observed`；reference 与不同命名、目录
结构的 equivalent fixture 公开语义 `pass`、分层 `observed`（组件通过边界模块调用，
边界负责 transport 与 401 翻译）。

通过 kernel 运行
`bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/login-page-auth-flow-v1 --output <已 materialize 的临时 workspace>`
可重放四项矩阵。driver 只接收 kernel 临时实体化的私有合成树。驱动会在每个
fixture 缺少依赖时运行 `bun install --frozen-lockfile`；首次运行前须为其安装
Chromium（在每个 fixture 目录运行 `bunx playwright install chromium`）。测试通过
Playwright `page.route` 拦截 `/api/session` 提供后端响应；产品代码只调用真实
`fetch`，不包含埋点、假延迟或演示凭据。四项矩阵要求：public-starter
`semantic=fail / not-observed`；reference、equivalent `semantic=pass / observed`；
anti-pattern `semantic=pass / not-observed`。全部 fixture 与 public starter 的
`bun run build`（tsc -b）必须通过。

## JudgeAgent rubric 校准（#136）

新增私有登录页 rubric `private/judge/rubric-v1.yaml`：四维度
（api-page-boundary / state-handling / form-experience / ui-ux，合计 100 分），
描述为结构特征与可观察行为，不绑定文件名、目录或 helper；rubric hash 固定并在
judge 记录中引用。评分器 `private/judge/score.ts` 为确定性 mock（不调用模型），
输出通过 `assertJudgeResultV1` 校验（`judge-result/v1` sidecar）。

重复策略 n=3 取中位数（确定性评分 → spread 恒为 0）；阈值：reference >= 80、
equivalent 与 reference 差值 <= 10、anti-pattern <= 50 且低于 reference >= 25、
boundary 只要求分类与理由稳定；confidence < 65 记为低 confidence，spread > 15
记为分歧（分歧时 sidecar 状态为 indeterminate 并记录各次分数与原因）。

`private/calibration/sets.yaml` 新增 `login-page-judge/v1` 集合（reference /
equivalent / anti-pattern / boundary），由 kernel 实体化后运行
`private/judge/calibrate.ts`（calibration role `judge-rubric-calibration`）。

login-page-judge 集合的 equivalent fixture 采用不同命名与目录结构（features/auth +
lib/apiClient），并把状态变量重命名为 isPending/setPending，覆盖状态变量改名场景
（评审 Fix-1 后矩阵仍 reference=100、equivalent=100，Delta=0）。

矩阵结果（#136，mock 离线，全部 observed / 无分歧 / 无低 confidence）：
reference = 100，equivalent = 100（Delta = 0），anti-pattern = 29（gap = 71），
boundary = 51。输入脱敏审计（`private/judge/input-audit.ts`）通过：输入只含
公开材料，无 condition / Practice / Oracle / private evaluator 标记。
