# async-cleanup-v3

skill-trigger-orchestration 轨道的规则不可推断候选任务（r13）。

## 场景

项目概览页同时有范围导航、同范围手动重载与后台协调。`PX-47` 定义这些来源的
结果权威：前台导航与手动重载权威；后台协调仅在「启动时无前台在途且距最近前台
启动超过 500ms」时生效，且结算时不得覆盖更新的前台操作。规则正文不在公开代码，
公开测试只断言现象级回归，政策符合性由私有 judge v2 判定。

## 结构

- `public/task.md`：现象级题面与验收声明，不泄露窗口阈值或规则方向。
- `public/starter/app/`：naive starter；公开测试含两条现象级回归（范围切换保留、
  后台协调失败后前台结果保持），naive 在此两条失败。
- `private/candidate.yaml`：kernel 声明与 baseline 期望。
- `private/conditions.yaml`：三条件；judge.provider 指向 skill-trigger-source-authority/v2。
- `private/practices/`：窗口规则 Practice 卡与无关 Practice。
- `private/evaluator/evaluate-operation-authority.ts`：仅跑公开测试判定 semantic。
- `private/calibration/run.ts`：公开测试校准（naive fail，reference/equiv/anti 均 pass）。
- `private/calibration/judge-calibrate.ts`：judge v2 校准（reference/equiv 判符合、
  anti-pattern 判不符合，真实 LLM）。
- `private/execution/run-local.ts --qualification`：工具可达性 canary，独立 scratch。

## 三层区分度

- naive：现象级公开测试失败（地板）。
- reference/equivalent：公开测试通过 + judge v2 判符合（窗口规则）。
- anti-pattern（后台永不覆盖）：公开测试通过但 judge v2 判不符合（陷阱，agent
  无法从测试推断窗口规则，查询成为消除不确定性的唯一途径）。

## 三条件对照

- baseline：地板，无 Skill、无查询。
- lorelum-retrieval：实验组，先通过 canary 与三次 mock 发现门，再进入质量 pilot。
- irrelevant-practice：盲从检测，mock 返回无关 Practice 的约束。
