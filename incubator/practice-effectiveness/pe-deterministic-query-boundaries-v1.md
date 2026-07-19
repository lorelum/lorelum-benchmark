# PE Deterministic Query Boundaries v1

- **ID**: `pe-deterministic-query-boundaries-v1`
- **标题**: 检索查询的过滤、排序与分页边界
- **来源**: `contract-derived seed`（依据本地 contract 合成；不是生产 issue）
- **实验主张**: 对本地条目查询同时存在作用域、状态、未知元数据和分页边界时，目标 Practice 能比 baseline 更稳定地过滤正确集合并保持确定顺序。

## 用户可见任务提示

请完成本地 `query` 命令：从 `fixtures/items.json` 按用户给出的 domain、status、标签和页码返回结果。已存在的响应字段和分页格式必须保持兼容；未知 domain/status、空集合、重复标签、负数或超出范围的页码要得到明确且一致的结果。相同输入在重排底层文件后必须返回相同顺序，不能把不匹配的条目混入结果。实现不得联网、读系统时间或依赖隐式全局状态。

不提示使用排序、缓存、特定 API 或 helper；正确实现需要理解过滤作用域和边界顺序。

## Practice 对照

- **相关 Lorelum Practice**: `MISSING`。需要明确检索过滤边界、确定性排序、分页 contract 和未知值处理的 Practice。
- **无关负对照 Practice**: `MISSING`。需要相同长度/工具权限但语义无关的 Practice（例如文档措辞一致性）；当前不存在。
- Vercel Skill 不覆盖此查询 contract；若使用只能作为外部 control，不能称为相关 Practice。

## 预期 baseline 失败模式

可能先分页后过滤、把未知值当通配符、使用不稳定输入顺序作为隐式排序、负页码返回首屏，或空集合与越界页码混淆。该列表是可证伪的 baseline 假设。

## 自动验收设计

- starter 在 hidden 组合过滤、未知值、空/越界页码和底层重排测试上应至少失败一项；不能只用 happy path 判定。
- reference 对合法查询返回精确集合、稳定顺序和兼容分页元数据；非法边界返回约定的结构化错误或空页，不混入记录。
- evaluator 运行固定查询矩阵并重排 fixture，比较规范化 JSON；检查过滤与分页语义、重复标签处理和顺序稳定性。

一个实现可能在示例查询上“功能可用”却依赖输入顺序或把未知状态当全部状态。只有通过重排、组合边界和空集探针，才算目标 Practice 的行为证据；Practice 规则本身仍待补齐。

## 实现范围

- `public/task.md`、`public/starter/`：查询 CLI/API、固定 fixture、manifest/lockfile 和本地测试。
- `private/evaluator/`：查询矩阵、规范化响应、集合/顺序/分页断言。
- `private/oracle/`：字段 contract、边界真值表和 reference。

## 混杂因素、排除条件与风险

- 固定 locale、JSON 编码、fixture 顺序和页大小；排除网络、数据库、时间和性能指标。
- 不混入并发更新、全文搜索或模糊匹配等额外变量。
- 风险是把“确定顺序”误定成未声明的业务排序；冻结前需在 contract 中公开排序键语义但不泄露实现。

## 适用条件

`baseline`、`oracle-practice`、`irrelevant-practice`、`lorelum-retrieval`（retrieval 条件需记录 query/trace/content hash）。

## 冻结前 checklist

- [ ] 版本化相关 Practice 与等长无关 control，并写入 treatment manifest。
- [ ] starter 在至少一个组合边界/重排 case 失败，reference 全部通过。
- [ ] 明确排序键、分页和未知值 contract；prompt 不泄露算法名称。
- [ ] evaluator 完全本地、确定性、可重跑；固定 fixtures hash。
- [ ] 通过 review 后才生成正式 snapshot，结果后不得改 v1。
