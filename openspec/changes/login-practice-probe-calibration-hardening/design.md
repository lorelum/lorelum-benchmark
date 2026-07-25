## Context

Issue #76 修复的是 #73 candidate 的评测校准，而不是实验执行。目标目录尚未位于当前 `main`，因此本分支只能先提交 OpenSpec；只有 #73 合并后，才能在同一 PR 上以合并后的 candidate 为父输入实施。candidate 仍处于 `incubator/` 且没有 record，允许原地更新 private evaluator、reference、conditions 与 snapshot。

Agent workspace 只能接收 `public/task.md` 与 `public/starter/`。private evaluator、Oracle、Practice 和 reference 不能进入工作区或模型输入；本 change 不调用模型，也不产生 artifact 或 pilot evidence。

## Goals / Non-Goals

**Goals:**

- 证明私有 probe 拒绝“导入 `login` 但绕过它”的组件，并要求实际调用指定 feature API。
- 以同一公开 Playwright 语义校准 naive starter 与完整 private reference，分别获得“语义通过/探针失败”和“双通过”。
- 不将未解析的模型别名表述为固定可复现执行条件；在 candidate 条件中显式标记 pending，并把实际 pinning 留给 #75 的独立 execution manifest。
- 在 private 输入变更后重写 candidate snapshot，并确认其不包含 post-run evidence 或生成物。

**Non-Goals:**

- 不修改 `public/` 题面或 starter，不执行 baseline、Oracle、无关 Practice、检索、盲评或模型调用。
- 不修改共享 evaluator、suite revision、runner、schema、treatment、environment 或正式 record。
- 不改写 #73 的 archive 目录或其 stable spec。

## Decisions

### 1. 使用 AST 绑定与调用关系检查，而非导入名称或文本匹配

probe 必须解析 `LoginPage.tsx`，定位指定 feature API 的 `login` 导入绑定，并要求该绑定至少在组件提交路径中被调用。它还必须拒绝来自非 `react` 和指定 feature API 的运行时导入，以及直接的 HTTP/request adapter 调用。负向 calibration fixture 固定“导入但未调用 login、以本地逻辑实现可观察登录”的绕过，以防回归。

仅靠更广泛的字符串黑名单无法处理别名与成员访问，且会把无关实现细节误判为违规。完整的数据流证明超出 candidate scope；这里的 probe 只证明预注册的 API 边界和调用要求，语义由 Playwright 独立验证。

### 2. Reference 必须是独立可运行的完整 app

private reference 将包含运行同一浏览器语义所需的 app 配置、测试和完整 UI，而不是只有三份源文件。它从自己的依赖根目录执行构建和 Playwright，再从 public starter 已安装的 TypeScript parser 执行 probe。calibration 文档只记录可重跑命令与观察到的 naive/reference 结果。

复制完整最小 app 会有少量重复，但避免测试在 public starter 上运行而没有证明 reference 行为；共享 public tests 的副本不含 private assertion，因此不会泄露私有规则。

### 3. 将模型版本 pinning 显式延后

candidate 的 `conditions.yaml` 将模型条件标为 pending，并说明 #75 只有在独立 execution manifest 固定 provider、不可变部署或模型版本、解析策略与时间戳后才能执行。不得猜测 provider 的版本标识，也不得用可变别名代替。

## Risks / Trade-offs

- [静态检查仍无法证明所有运行时数据流] -> 语义与 API 边界保持两份独立检查；新增已知绕过 fixture 以保护最关键的假阳性。
- [#73 未合并导致实现基线缺失] -> 初始 PR 只含 OpenSpec，并把 #73 合并设为实现门禁；实施前重新验证 snapshot 与路径。
- [模型提供商没有可固定版本] -> 条件保持 pending，#75 不得开始比较，而非创建不可复现的 pilot。
