# 登录页 Practice 候选说明

## 目录定位

```text
incubator/              未进入活跃 suite 的候选
  practice-injection/   Practice 注入实验候选
    login-page-layered-api-v1/
      public/           编码代理唯一可见的输入
      private/          本目录：评测、Practice、执行治理和快照
```

该候选尚未执行比较，也没有正式 benchmark record，因此放在 `incubator/`，而不放在
`suites/`。`public/` 和 `private/` 分离，确保 baseline 不会提前获知“API 分层”这一实验
处理变量。

## 设计推导

这个布局不是从“先建一套目录”开始，而是从实验需要排除的错误解释反推出来的：

1. **先区分候选和正式任务。** 当前没有比较结果，也没有冻结 record；若直接放进 `suites/`，
   会把尚未验证的假设伪装成活跃 benchmark。因此先用 `incubator/` 承担可评审、可删除的候选。
2. **再隔离实验变量。** 要验证的是私有 Practice 是否改善分层，而不是公开题面是否提示了分层。
   因此任务、starter 和公开测试只能放在 `public/`；Practice、Oracle 和 evaluator 必须放在
   `private/`，且 Practice 只能在对应条件的运行时注入。
3. **让任务同时具备功能基线和质量差异。** starter 已能完成登录，因而 naive 实现会通过公开
   语义；它却把请求与认证响应留在组件中，因而会失败私有分层探针。这样才能观察到“功能正确”
   与“遵循 Practice”不是同一个指标。
4. **避免单一评测器自行证明自己。** Playwright 负责可观察行为，AST 探针负责静态边界；
   `calibration/reference/` 与 naive starter 分别证明探针能接受正确实现、拒绝错误实现。
5. **控制额外文本带来的混杂。** Oracle 与无关 Practice 用同一模板、近似字符数；否则 Oracle
   条件的改善也可能只是因为提示更长或形式不同。
6. **在执行前固定可比较输入。** `conditions.yaml` 固定模型、预算、工作区和卡片哈希；
   `snapshot.json` 冻结候选输入。这样后续条件间唯一预期差异才是 Practice 注入。
7. **本地结果只用于观察。** 每次运行的 diff、Pi 输出和评测摘要写入被忽略的 `scratch/`；
   它们可以用于本机复跑和排查，但不构成正式 benchmark record。

这套推导同时决定了“为什么有这些目录”和“为什么不能将它们合并”。它优先保证结论可解释，
而不是追求最少文件数。

## 公开输入

| 路径 | 用途 |
| --- | --- |
| `../public/task.md` | 编码代理看到的题面，只规定登录成功、401、300 毫秒禁用和重复提交行为。 |
| `../public/starter/app/package.json` | 固定 Vite、React、TypeScript、Playwright 依赖。 |
| `../public/starter/app/bun.lock` | 固定依赖解析结果。 |
| `../public/starter/app/index.html` | Vite 页面入口。 |
| `../public/starter/app/vite.config.ts` | Vite 与 React 插件配置。 |
| `../public/starter/app/tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json` | TypeScript 项目与构建配置。 |
| `../public/starter/app/playwright.config.ts` | Chromium 浏览器测试和本地服务配置。 |
| `../public/starter/app/src/main.tsx` | 挂载 React 登录页。 |
| `../public/starter/app/src/LoginPage.tsx` | naive baseline：功能正确，但直接调用请求适配器并解释认证响应。 |
| `../public/starter/app/src/services/http.ts` | 假登录请求适配器，提供固定延迟、成功和 401 响应。 |
| `../public/starter/app/src/styles.css` | 最小页面样式。 |
| `../public/starter/app/tests/login.spec.ts` | 只验证公开登录行为，不验证 API 分层。 |
| `../public/starter/app/.gitignore` | 排除依赖、构建物和浏览器测试产物。 |

候选还没有 `task.yaml`，因为它尚未成为需要登记到 suite 的正式任务版本。

## 私有验收

| 路径 | 用途 |
| --- | --- |
| `candidate.yaml` | 候选身份、来源提交、依赖版本、公开边界和 baseline 预期。 |
| `oracle.yaml` | 私有验收契约；功能语义和分层探针必须分别报告。 |
| `evaluator/evaluate.ts` | 组合运行语义测试与分层探针。 |
| `evaluator/verify-layering.ts` | 使用 TypeScript AST 检查组件导入边界和 feature API 职责。 |
| `calibration.md` | 定义 reference/naive 校准应得到的结果。 |
| `calibration/reference/` | 独立可运行的完整 reference app，用来证明分层探针和公开浏览器语义可以同时通过。 |
| `calibration/fixtures/` | 仅供私有探针回归校准的已知绕过实现。 |

公开 starter 本身是 naive 校准对象：浏览器语义测试应通过，分层探针应失败。reference 则应
通过分层探针。这证明“功能正确”和“Practice 遵循”是可区分的指标。

## Practice 与执行治理

| 路径 | 用途 |
| --- | --- |
| `practices/react.api.layered-design.v1.md` | Oracle Practice 卡，仅可通过私有条件运行时通道注入。 |
| `practices/irrelevant.identity-list-rendering.v1.md` | 与 Oracle 同模板、近似长度的无关 Practice 对照。 |
| `practices/metadata.yaml` | 两张卡的长度、模板和独立评审记录。 |
| `conditions.yaml` | 三个可执行条件、固定模型/预算、Practice 哈希、检索不可用状态和推进规则。 |
| `execution/tool-policy.yaml` | 代理工作区只可获得 `public/task.md` 与 `public/starter/`；私有 oracle/evaluator 不得进入模型输入。 |
| `execution/run-local.ts` | 本地三条件执行器；创建干净工作区、调用 Pi、运行 evaluator 并生成摘要。 |

## 本地执行

先检查条件、快照和计划的工作区，不调用模型：

```sh
bun run practice:login-local -- --dry-run
```

本机 Pi 与模型凭据可用后执行默认的六次对照：

```sh
bun run practice:login-local
```

可用 `--repeat N` 覆盖每个条件的次数，或用 `--output scratch/<name>` 指定被忽略的输出目录。
`summary.json` 会列出每次的语义结果、分层结果和双通过结果；Pi 输出、evaluator 输出与 diff 都只保存在该目录。

## 快照与推进

`snapshot.json` 是候选输入的 SHA-256 清单。它排除 `node_modules` 和构建/测试产物；
运行输出始终留在被忽略的 `scratch/`，不会改变候选输入。

本地汇总中仅当 Oracle 条件的“双通过”次数高于 baseline 和无关对照时，才记为值得扩大样本的
信号。无论结果如何，当前 candidate 都不会创建正式 record 或升级为 suite revision。
