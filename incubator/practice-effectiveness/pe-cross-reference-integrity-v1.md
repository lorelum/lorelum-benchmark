# PE Cross-Reference Integrity v1

- **ID**: `pe-cross-reference-integrity-v1`
- **标题**: 注册表交叉引用完整性
- **来源**: `contract-derived seed`（依据本地 contract 合成；不是生产 issue）
- **实验主张**: 在 registry 与条目互相引用的 contract 下，目标 Practice 能比 baseline 更完整地发现重复、悬空和缺失引用，并保留可定位的来源信息。

## 用户可见任务提示

请完成一个本地 registry 检查器。它读取 `fixtures/registry.json` 和各条目文件，输出可供发布流程消费的索引。合法 registry 必须保持现有索引格式；如果出现重复 ID、条目声明了不存在的 registry ID、registry 指向缺失条目，或跨文件引用类型不匹配，应阻止发布并输出所有独立问题的文件与字段位置。目录遍历顺序、文件名大小写和错误出现顺序不能改变结果。不得联网或修改输入文件。

题面只描述产品行为、兼容性和约束，不指定引用图算法、helper 或规则名称。

## Practice 对照

- **相关 Lorelum Practice**: `MISSING`。需要覆盖 cross-reference 完整性、双向一致性、重复键和来源定位的版本化 Practice。
- **无关负对照 Practice**: `MISSING`。需要等长、相同工具权限但语义无关的 Practice（例如终端输出可读性）；目前没有可冻结 control。
- Vercel Skill 仅为外部类比材料，不是 Lorelum registry Practice。

## 预期 baseline 失败模式

可能只检查 registry 到条目的单向存在性，漏掉条目到 registry 的悬空引用；遇到重复 ID 采用后写覆盖；只报告首个错误或丢失来源位置；结果随遍历顺序变化。这些是需用 pilot 验证的失败假设。

## 自动验收设计

- starter 对包含重复 ID、双向不一致和缺失文件的 hidden fixtures 应错误退出或生成可发布索引，故判定失败；对合法 fixture 可能通过。
- reference 对合法 fixture 生成兼容索引；对每个非法 fixture 阻止发布，诊断包含稳定的 `file`/`path`/`code`，并累计全部独立问题。
- evaluator 重排 registry、条目和目录输入后比较规范化诊断集合，检查没有静默覆盖或漏报。

仅功能上生成索引不等于遵从目标 Practice：一个实现可能在单一悬空引用上通过，却漏报重复/反向问题。隐藏组合 fixtures、重排不变性和来源定位共同构成遵从判据，待 Practice oracle 确认后才记分。

## 实现范围

- `public/task.md`、`public/starter/`：本地 registry/entry fixtures、CLI、lockfile 和检查脚本。
- `private/evaluator/`：索引等价性、发布阻断、诊断集合及来源位置断言。
- `private/oracle/`：引用关系 contract、reference 实现和 fixture 期望。

## 混杂因素、排除条件与风险

- 只使用固定本地文件；排除网络、并发文件变更、文件系统非确定排序和大型数据性能。
- 固定大小写规则、路径分隔符和 JSON 编码；避免把诊断文本语言当分数。
- 风险是“严格双向引用”与现有 contract 不兼容，或 fixture 同时改变多个变量；每个 case 只引入一种主要破坏。

## 适用条件

`baseline`、`oracle-practice`、`irrelevant-practice`、`lorelum-retrieval`（依赖待建 treatment 与 trace）。

## 冻结前 checklist

- [ ] 相关 Practice 与等长无关 control 已版本化并审核。
- [ ] starter 至少漏报一类组合引用错误，reference 全部通过。
- [ ] evaluator 能证明重复、双向和来源位置三类行为；无网络依赖。
- [ ] prompt 和 fixtures 不泄露具体实现；固定路径/大小写语义。
- [ ] 完成 snapshot 前审查，结果产生后不得修改 v1。
