## Why

Issue #106 的两个 `injection-calibration/v1` incubator candidate 为各个 private
calibration fixture 保存了与 public starter 高度重复的源码。虽然 Git blob 会去重，
checkout 体积、审阅负担和 snapshot 输入仍随 fixture 数量增加。需要一份版本固定、可
复现的 base + overlay 契约，在不改变已有 candidate 结论的前提下消除这些物理重复。

## What Changes

- 为 calibration fixture 引入全局版本化 registry 与 candidate-local、versioned calibration
  set 的 base + overlay 声明和确定性合成树解析。
- 将 base 内容、overlay 声明和合成树身份共同纳入校准输入身份及 snapshot v1 的 resolved
  信息；base 或 override 改动必须使校验失败。
- 令 materializer、isolation、calibration evaluator 和 snapshot 消费同一个解析器，并在
  缺失、digest 不匹配、非法路径、冲突、循环或消费者结果不一致时 fail closed。
- 保持 private calibration 与 Practice 的隔离；不将 Practice 文本或 `private/practices/`
  路径引入 agent workspace、公开 prompt、trace、普通 snapshot files 或生成物。
- 首版支持兼容 profile/materializer 的新 candidate 复用 registry base；同一 candidate 的
  新 Practice 以新 set/version 扩展，旧 set 保持不可改写。

## Capabilities

### New Capabilities

- `calibration-fixture-overlay`: 为 kernel-backed calibration fixture 定义版本固定、
  digest 绑定、可审计的 base + overlay 合成契约。

### Modified Capabilities

- 无。

## Impact

- `src/benchmark/kernel/` 的 core、materializer、isolation 与 calibration 路径。
- `src/benchmark/snapshot.ts` 的 resolved snapshot v1 计算与验证。
- `incubator/` 中经确认的 candidate calibration 声明、driver 和 fixture 源码。
- 相关 focused tests、public/private 泄露审计和文档；不修改 #75、不实现 snapshot v2，
  不运行 Pi、模型、retrieval、盲评或正式 record。
