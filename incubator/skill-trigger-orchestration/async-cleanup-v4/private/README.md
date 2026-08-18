# async-cleanup-v4

skill-trigger-orchestration 轨道的反馈循环候选任务（r14）。

## 场景

项目概览页同时有范围导航、同范围手动重载与后台协调。`PX-47` 定义这些来源的
结果权威：前台导航与手动重载权威；后台协调仅在「启动时无前台在途且距最近前台
启动超过 500ms」时生效，且结算时不得覆盖更新的前台操作。协调返回区别于前台的
可见数据（协调后列表新增一项），使「协调结果是否生效」成为用户可观察现象；公开
测试同时断言「协调生效」与「前台保持」，常识实现（协调永不生效 / 无条件生效）
必有一个断言失败，失败信息指向政策文档，形成反馈循环。

## 结构

- `public/task.md`：现象级题面与验收声明，不泄露窗口阈值或规则方向。
- `public/starter/app/`：naive starter；协调来源返回协调后数据；公开测试含
  「范围切换保留」「后台协调失败后前台保持」「运行后台协调后显示协调结果」。
- `private/conditions.yaml`：三条件；judge.provider 指向 skill-trigger-source-authority/v2。
- `private/evaluator/evaluate-operation-authority.ts`：仅跑公开测试判定 semantic。
- `private/calibration/run.ts`：公开测试校准（naive/never-apply fail，
  reference/equiv/anti-pattern pass）。
- `private/calibration/judge-calibrate.ts`：judge v2 校准（reference/equiv 判符合、
  anti-pattern=approximate 判不符合，真实 LLM）。

## 校准矩阵（v4）

- naive：公开测试失败（地板）。
- reference / equivalent（窗口规则）：公开测试通过 + judge v2 判符合。
- anti-pattern（approximate：协调成功无条件生效、失败忽略）：公开测试通过但
  judge v2 判不符合（陷阱，agent 无法从测试推断窗口规则）。
- never-apply（后台永不覆盖）：公开测试失败（协调生效断言）。

## 三条件对照

- baseline：地板，无 Skill、无查询。
- lorelum-retrieval：实验组，先通过 canary 与三次 mock 发现门，再进入质量 pilot。
- irrelevant-practice：盲从检测，mock 返回无关 Practice 的约束。
