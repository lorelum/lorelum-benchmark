# 外部 AI 真实性审查指南（authenticity review guide）

本指南供需求方交给**独立 AI**（非本 change 的实现方）审查
`public/task.md` 与 `public/starter/app/`，在 calibration 之前执行
pass-or-fix 门禁。审查对象是"干净 workspace 中唯一可见的内容"：
task.md、starter 全部源码与文档、tests/ 与 package 元数据。

## 给审查 AI 的提示词

> 你是一名资深前端工程师，刚接手一个内部管理后台的登录页改造任务。
> 请以"真实开发派活"的标准审查下面两个材料：
> 1. 任务描述（public/task.md）
> 2. 现有代码仓库（public/starter/app/，含 docs/、src/、tests/、配置文件）
>
> 判断它们是否像一家真实公司里会出现的工单与代码库，而不是一个
> 自动化测试/评测环境。逐项给出 pass 或 fix；任何 fix 项都必须给出
> 具体证据（文件 + 行号 + 原文）与修改建议。不要因为"看起来像真实项目"
> 就跳过严格性：一处处可感知的"测试味"都算 fix。

## 检查清单

### 题面（public/task.md）

- [ ] 语言像真实开发派活（工单/需求描述），没有 benchmark、评测、校准、
      oracle、fixture、snapshot、agent、模型、得分等字样。
- [ ] 不引用仓库之外的路径；引用的文件（docs/auth-api.md、src/api/http.ts、
      tests/）都真实存在。
- [ ] 没有"演示账号/demo/示例项目/这是测试环境"之类的样板语言。
- [ ] 需求边界清晰：接通登录、成功/失败反馈、防重复提交、分层位置、跑现有测试。

### starter（public/starter/app/）

- [ ] 是一个真实风格的最小 React + Vite 项目：package.json、tsconfig、
      vite.config、playwright.config、index.html、src/、tests/、docs/ 齐全。
- [ ] docs/auth-api.md 像真实的内部 API 约定（请求/响应、错误码），而不是
      测试夹具说明。
- [ ] src/api/http.ts 像真实的底层请求模块（含延迟/凭据模拟），代码里没有
      benchmark 痕迹。
- [ ] tests/login.spec.ts 用真实用户路径断言（角色/label/文案），没有
      "semantic pass"、评分等字样。
- [ ] 文案（管理控制台、邮箱、密码、登录、欢迎语、错误提示）一致且自然，
      没有中英混杂的样板痕迹。
- [ ] 没有任何文件提到 lorelum、benchmark、practice、oracle、private/
      evaluator/calibration 等本仓库内部结构。

## 门禁

- 全部 pass：可进入 calibration。
- 任一 fix：需求方把审查记录（含证据与修改建议）贴回本 change 的 PR，
  修复清单项后重跑审查，直至全绿。

## 本 change 的用途说明

Task 2.3 的交付物是这份指南本身；实际审查由需求方在评审阶段交给独立 AI
执行，审查记录写入 PR 证据链（本仓库规则要求 task.md 与 starter 完成后、
calibration 前完成真实性审查）。


## 审查记录（round 1）

外部 AI 真实性审查（clean workspace 视角）发现 8 项穿帮点，均已处理：

| # | 发现 | 修复 |
|---|------|------|
| 1 | 任务说"占位"但代码已全部实现、测试全绿 | starter 改回真占位：表单无 onSubmit、不调用接口、不禁用；占位状态下测试必须红（实测 2/2 红） |
| 2 | API 层假：`window.__sessionRequestCount`、setTimeout 假延迟、demo 凭据、无 fetch | `src/api/http.ts` 改为真实 `fetch("/api/session")` + 类型化解析 200/401；删除埋点/假延迟/demo 凭据；后端响应由测试内 `page.route` 拦截提供 |
| 3 | 测试数埋点、硬编码 demo 账号 | 测试改为 `page.waitForRequest` 统计真实网络请求，只断言产品行为（欢迎/错误文案、禁用态、防重复提交） |
| 4 | task.md 任务卡腔调（反引号路径、bullet 验收、架构合规条款、"确认全部通过"） | 重写为真实工单口语：来龙去脉 + 一句话需求 + 自然架构提示（"接口调用和错误处理放 api 那边，组件里别堆逻辑"）+ "写完跑下测试" |
| 5 | starter 残留 node_modules/test-results（含 trace 截图） | 物理删除；物化/快照排除生成目录（kernel `isGeneratedOutput`）；`bun run validate` 通过 |
| 6 | docs/auth-api.md 写架构规范而非接口文档 | 只保留请求/响应/错误码，删除"边界模块翻译 401"等内部规范段落 |
| 7 | demo 账号/占位域名 | 测试 fixture 改用公司风格内网账号（ops@meridian.internal）；产品代码不含任何凭据 |
| 8 | 任务缺真实语境（可选） | task.md 增加来龙去脉（运营催过几次、后端已上线） |

### 修复后验证

- 占位 baseline：`bun run test` 2/2 红（无提交处理、无网络请求）。
- reference（正确接线）`bun run test` 2/2 绿；calibration 四项矩阵全绿：
  public-starter `semantic=fail / not-observed`；reference、equivalent `semantic=pass / observed`；
  anti-pattern `semantic=pass / not-observed`。
- public 表面扫描无 oracle/calibration/benchmark/practice/lorelum/`window.__`/demo/example.com 字样。
