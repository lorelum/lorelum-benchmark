## Context

#178 pilot 判定 `diagnostic-only`：judge 主判据下 oracle 与 irrelevant 无差异（都 100），baseline 也有 attempt 拿满分。根因是任务无 headroom + judge rubric 对 Practice 盲。需求方确认采用方式 B：扩展 judge provider 输入，把注入的 Practice 文本一并喂给 rubric 生成，走独立版本号（不改冻结 `generic/v2`）。

## Goals / Non-Goals

**Goals:**

- 新建 `judge-agent/practice-aware/v1`：rubric 生成 prompt 同时包含 `task.md` 与 Practice 文本。
- 重做 v3 candidate：task.md 只声明基本行为要求；starter 故意留结构缺口。
- candidate `conditions.yaml` 的 judge 声明改为 `judge-agent/practice-aware/v1`。
- 更新 calibration matrix、probe、snapshot 与验证证据。

**Non-Goals:**

- 不修改冻结 `judge-agent/generic/v1/v2` 或其他已使用共享 helper。
- 不修改 v1/v2 candidate、其 snapshot、已有 pilot 结果或 suite/treatment/record。
- 不执行模型调用、不创建正式 record、不升级 suite revision。

## Decisions

### Judge provider 版本

- 新建独立目录 `src/benchmark/judge/judge-agent/practice-aware/v1/`，复用 `generic/v2` 的 LLM 客户端与 score 结构，但 rubric 生成 prompt 增加 Practice 文本输入。
- `JudgeProvider.rubricText` 接口已有可选 `{ task_md }` 参数；扩展为 `{ task_md, practice_text? }`，向后兼容（未提供时行为不变）。
- candidate `conditions.yaml` 的 `shared_execution.judge.provider` 改为 `judge-agent/practice-aware/v1`。
- runner 在调用 `rubricText` 时传入 oracle Practice 文本（从 condition-scoped private runtime channel 读取）；baseline/irrelevant 条件不传或传空，但三条件仍用同一 rubric hash（以 oracle Practice 为唯一生成输入）。

### v3 公开题面与 starter 缺口

- `public/task.md` 只声明基本行为要求（接入 Nebula、fallback/retry、租户预算、幂等、流式失败记账），不预写分层/边界/集中政策细节。
- `public/starter` 保留传输 adapter 与 API 文档，移除预置领域翻译/策略/账本边界；公开测试经 stub 拦截，不依赖产品内埋点。
- baseline 能过基本功能但拿不到结构分；oracle 按 Practice 补上缺口拿高分。

### 校准矩阵

- 保留 reference/equivalent/type-based/docs-present/anti-pattern 基线与真实命名变体回归。
- 新增 practice-aware judge 校准夹具：reference/equivalent 高分且接近，anti-pattern/docs-present 低分且有判别差距。
- 探针校准仍按 `practice-structure-probe-calibration` stable spec 执行。

### 验证

- `bun run validate`、OpenSpec strict、泄露审计、`git diff --check`。
- kernel calibration（无模型）+ practice-aware judge 离线校准（显式 opt-in，仅内部 endpoint）。
- 不创建正式 record、不升级 suite。

## Risks / Trade-offs

- [Practice 文本进入 rubric prompt 可能引入私有材料] → 必须通过与 buildJudgeInput 相同的公开/私有边界检查；含私有路径/oracle 内容 fail closed。
- [rubric 对结构维度判别力不足] → 用 anti-pattern/docs-present 夹具验证扣分方向；不足则标记诊断性，不用于方向性结论。
- [starter 缺口过大导致 baseline 全部失败] → baseline 只需过基本功能即可产生结构分差距；若全失败则调整 task.md 行为声明粒度。

## Migration Plan

1. 创建 issue #182、分支与 OpenSpec change；提交仅含 OpenSpec artifacts 的初始 PR。
2. 完成规划澄清并写回 #182 与本 design。
3. 实现 practice-aware judge provider v1 + 单元测试。
4. 重做 v3 candidate public/private 内容与 snapshot。
5. 运行全部验证门禁并记录证据。

回滚：删除 practice-aware provider 目录与 v3 重做 diff；OpenSpec delta 未归档前不改变 stable specs。

## Planning Confirmation

待需求方确认以下口径后写回：

1. Practice 文本传入 rubric 生成的具体接口形态（扩展 `rubricText` 可选参数 vs 新增专用方法）。
2. 三条件同尺子的实现方式（以 oracle Practice 为唯一生成输入 vs 固定 rubric env）。
3. 本次 candidate 交付前的确定性验证是否授权真实 judge 调用（内部 endpoint，显式 opt-in）。
