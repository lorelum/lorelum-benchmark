## 1. Issue、OpenSpec 与初始 PR

- [x] 1.1 确认 issue #182 存在且范围单一。
- [x] 1.2 创建 `llm-provider-gateway-v3-practice-judge` change，补齐 proposal/specs/design/tasks。
- [x] 1.3 运行 `openspec validate llm-provider-gateway-v3-practice-judge --type change --strict`，修正至通过。
- [x] 1.4 从最新 main 创建 `codex/llm-provider-gateway-v3-practice-judge` 分支，提交仅含 OpenSpec artifacts 的变更并创建初始 PR（引用 #182）。
- [x] 1.5 完成规划澄清，将需求方对接口形态、同尺子方式与 judge 授权的回答写回 #182 与 design Planning Confirmation。

## 2. Practice-aware judge provider v1

- [x] 2.1 新建 `src/benchmark/judge/judge-agent/practice-aware/v1/`（provider/rubric/score/llm），rubric 生成 prompt 同时包含 task.md 与 Practice 文本。
- [x] 2.2 扩展 `JudgeProvider.rubricText` 可选参数为 `{ task_md, practice_text? }`，向后兼容。
- [x] 2.3 添加单元测试：Practice 输入生效、无 Practice 向后兼容、私有输入 fail closed、generic/v2 不变。
- [x] 2.4 在 runner 中传入 oracle Practice 文本；三条件使用同一 rubric hash。

## 3. 重做 v3 candidate

- [x] 3.1 重写 `public/task.md` 只声明基本行为要求，不预写 Practice 结构纪律细节。
- [x] 3.2 重做 `public/starter` 留结构缺口：保留传输 adapter 与 API 文档，移除预置领域翻译/策略/账本边界。
- [x] 3.3 更新公开测试经 stub 拦截，不依赖产品内埋点。
- [x] 3.4 更新 private conditions.yaml 的 judge 声明为 `judge-agent/practice-aware/v1`。
- [x] 3.5 更新 private practices/metadata/oracle/calibration matrix/snapshot。

## 4. 校准与判别力验证

- [x] 4.1 运行 kernel calibration（无模型）确认探针矩阵仍通过。
- [ ] 4.2 用 practice-aware judge 对 calibration 夹具离线打分（显式 opt-in，仅内部 endpoint）。
- [ ] 4.3 验证 reference/equivalent 高分、anti-pattern/docs-present 低分且有判别差距。
- [ ] 4.4 记录判别力证据到 verification/。

## 5. 最终门禁

- [ ] 5.1 运行 `bun run validate`、OpenSpec strict、泄露审计、`git diff --check`。
- [ ] 5.2 确认未调用模型（除授权的 judge 校准）、未创建正式 record、未升级 suite revision。
- [ ] 5.3 确认 v1/v2 candidate、其 snapshot、已有 pilot 结果、suite/treatment/record 无 diff。
