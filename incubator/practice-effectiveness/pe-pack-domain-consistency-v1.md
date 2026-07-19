# PE Pack Domain Consistency v1

- **ID**: `pe-pack-domain-consistency-v1`
- **标题**: pack、domain 与 entrypoint 一致性
- **来源**: `contract-derived seed`（依据本地 contract 合成；不是生产 issue）
- **实验主张**: 当 pack 声明的 domain、entrypoint 和跨 pack 依赖不一致时，目标 Practice 能比 baseline 更可靠地阻止发布并指出责任边界。

## 用户可见任务提示

请完成本地 pack 发布前检查器。每个 pack 有 manifest、domain 声明、entrypoint 和依赖列表。合法 pack 应生成现有发布索引；如果 entrypoint 不属于声明 domain、依赖指向不存在或不兼容的 domain、manifest 与实际导出不一致，必须阻止发布并报告受影响 pack、字段路径和关系。检查应覆盖多 pack 组合且结果稳定，不得联网或执行任意远程代码。

不点名 domain helper、图遍历、缓存或其他具体解法；只给出产品 contract 和安全边界。

## Practice 对照

- **相关 Lorelum Practice**: `MISSING`。需要版本化 pack/domain ownership、entrypoint contract 和跨域依赖边界 Practice。
- **无关负对照 Practice**: `MISSING`。需要相同提示长度、运行时和权限但语义无关的 control（例如测试命名规范）；当前无法冻结。
- Vercel Skill 可作为外部比较但不能填补 Lorelum Practice 缺口。

## 预期 baseline 失败模式

可能只检查 manifest 存在而不核对实际导出，允许跨 domain 依赖或把缺失依赖当可选，遇到多个 pack 只报告首项，或以 pack 遍历顺序决定诊断。此处不预设模型或真实生产失败率。

## 自动验收设计

- starter 在 hidden fixtures 中至少放过一个错误 domain/entrypoint 或错误依赖，或发布索引仍成功生成，判定失败。
- reference 对合法多 pack 生成兼容索引；对每种不一致阻止发布，诊断包含 pack、路径和关系类别，并累计独立问题。
- evaluator 重排 pack/依赖输入、替换同名 entrypoint、混合多个 domain，检查阻断、诊断完整性和确定性；不执行远程代码。

“能发布一个 happy-path pack”不代表遵从 Practice。组合跨域、同名 entrypoint 和重排输入可揭示只做表面检查的实现；最终判定依赖待建 oracle，而不是代码风格或特定 helper。

## 实现范围

- `public/task.md`、`public/starter/`：最小 pack fixtures、manifest/entrypoint 文件、发布 CLI、lockfile 与本地检查。
- `private/evaluator/`：发布阻断、跨域关系、导出匹配、诊断 schema/顺序断言。
- `private/oracle/`：domain/entrypoint contract、reference、组合 hidden fixtures。

## 混杂因素、排除条件与风险

- 固定模块格式、路径大小写、导出命名和 fixture 顺序；排除真实包管理器、网络和任意代码执行。
- 不同时改变版本解析、性能或打包产物；每个 fixture 只改变一个主要一致性变量。
- 风险是 domain 边界定义尚未被 Lorelum 正式 contract 支持；若无法补齐 Practice，应保留为缺口而非晋升候选。

## 适用条件

`baseline`、`oracle-practice`、`irrelevant-practice`、`lorelum-retrieval`（retrieval 需记录 query/trace/content hash）。

## 冻结前 checklist

- [ ] 补齐相关 Practice 和等长无关 control 的版本/hash/treatment。
- [ ] starter 在跨域组合 hidden case 失败，reference 通过合法与非法矩阵。
- [ ] 明确 domain ownership 与 entrypoint contract，prompt 不泄露实现。
- [ ] evaluator 完全本地确定性，禁止远程代码/服务。
- [ ] review、snapshot 和 revision 不可变规则均已确认。
