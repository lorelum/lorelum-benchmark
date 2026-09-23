# Tasks

## 1. 确认上游依赖与固定来源

- [ ] 1.1 验证 Lorelum #236 已交付 N/K 分离和 ID-only 本地 harness，记录可运行的 Lorelum commit 与 harness 协议；以主仓库回归测试证据确认 baseline 排序未变，未完成前不开始本仓库 runner/scorer 实现
- [ ] 1.2 从锁定的 Pack 仓库提交重建完整临时 Store，生成完整 Practice ID 清单和内容 digest；验证它与固定来源一致且不依赖用户全局 Store

## 2. 建立版本化案例与独立 track 契约

写入范围：`suites/retrieval-ranking/`、`schemas/`、`src/benchmark/validate.ts` 及相关验证测试；不修改现有 Agent track schema 语义。

- [ ] 2.1 新增 retrieval-ranking suite/case revision，固定 corpus pin、query 集、N/K 默认配置和 case IDs；schema/validator 拒绝语料外 ID、缺失 core、重复 case 与不完整来源记录
- [ ] 2.2 编制完整 query 集，覆盖 Issue #222 约定的场景类别；逐案例标注共同必需 core 与确实 task/phase-mismatched 的 scope-confuser，验证替代答案已拆案例且标签引用存在
- [ ] 2.3 分离 query 输入与 private gold/scoring 文件；通过 fixture contract test 证明可传给 harness 的 query 数据不含标签字段或 gold ID 清单
- [ ] 2.4 新增 track-specific suite、batch manifest 与 batch record schemas 及 validator 分派；运行旧轨道 contract fixtures，确认现有 Agent suite、manifest 和 record 继续通过

## 3. 实现确定性评分

写入范围：`src/benchmark/retrieval-ranking/scorer/` 与对应 contract tests。

- [ ] 3.1 从 core IDs、scope-confuser IDs、candidateIds 与 finalIds 生成逐案例 Recall@N、top-K 命中/排名、候选缺失或最终排序遗漏分类及适用的 pairwise inversion；单元测试覆盖 core 不召回、召回但未进 K、confuser 在 core 前/后和多 core 案例
- [ ] 3.2 生成保留原始逐例证据的批次汇总，不引入加权总分；测试证明 scope-confuser 单独进入 top K 不自动判失败，且结果不作 Agent 效果或全局生产准确率解释

## 4. 实现 runner 与过程边界

写入范围：`src/benchmark/retrieval-ranking/runner/` 与对应 runner contract tests；调用固定 Lorelum checkout 的本地 harness，不修改主仓库。

- [ ] 4.1 从锁定 commit 启动主仓库本地 harness，在隔离临时 Store 上逐 query 执行，并仅序列化 query、固定 Store/Pack、Profile、N、K；通过捕获 stdin 的 contract test 验证没有 gold labels、scorer 字段、正文、内部 score 或用户 CLI 调试输出
- [ ] 4.2 验证结构化 success/failure、同次检索的 candidate/final IDs、retry 与失败语义；测试确保失败或不完整名单不会被评分为成功
- [ ] 4.3 输出逐 query ID-only 结果附件及 hash；contract test 验证 query 回显、Practice 正文、相似度与内部 score 均不会进入 harness response 或结果附件

## 5. 批次记录、验证与完整 baseline

写入范围：`results/records/`、track-specific record/manifest validation、`package.json` 的必要验证脚本及集成测试。

- [ ] 5.1 实现一整组 query 对应一条 batch manifest/record，记录 benchmark/corpus/query/label/scorer revision、Lorelum commit、Profile/model、N/K、环境和 artifact hashes；测试完整、失败、重跑均有独立且不可拼接的记录状态
- [ ] 5.2 运行 `openspec validate retrieval-ranking-benchmark --type change --strict --json`、`bun run validate` 和相关 contract tests，保存验证结果并检查无 gold-to-harness 泄漏
- [ ] 5.3 在锁定 Lorelum commit、Profile、环境、Pack corpus、query/labels/scorer、N=20、K=5 下跑完全量案例，生成一条完整改动前 baseline 记录和可校验结果附件；只要求运行完整有效，不设置检索分数门槛
