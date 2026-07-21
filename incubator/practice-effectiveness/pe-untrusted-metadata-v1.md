# PE Untrusted Metadata v1

- **ID**: `pe-untrusted-metadata-v1`
- **标题**: 不可信插件元数据的兼容校验
- **来源状态**: `source-gated draft`（现有 fixture 是 contract-derived seed；不是生产 issue）
- **实验主张**: 在相同的元数据 contract 下，提供目标 Practice 的 agent 比 baseline 更常拒绝不可信输入、保留有效输入并给出稳定的结构化诊断。

## 用户可见任务提示

你正在维护一个本地 Node/Bun 工具，它读取 `fixtures/plugins/` 下的插件清单并输出可供宿主加载的 manifest。请实现缺失的校验逻辑，使工具在合法清单上保持现有输出兼容；对缺少必填字段、错误类型、未知版本、超长值和额外字段的清单，不得生成可加载 manifest，而要输出稳定、可机器读取的诊断（包含文件、字段路径和错误类别）。输入顺序不应改变结果，工具不得访问网络或外部服务。保留现有 CLI 入口和退出码约定，并补充本地检查。

提示不点名 Practice、anti-pattern、规则 ID、API 或具体算法；实现者需要从输入边界和兼容性要求推导方案。

## 暂定 Profile 方向

- 当前不声明 Oracle Practice、无关 control 或任何内容 hash。真实来源审核通过后，才可为每个独立 profile 冻结相关 Practice、长度/形式可比的无关 control 和 adherence probes。
- 历史 `validate-untrusted-metadata-boundaries` 草案仅可作为问题空间参考，不能作为此 kernel 的来源或 intervention。

## 预期 baseline 失败模式

常见风险是只校验少数必填字段、把未知字段静默吞掉、遇到首个错误就抛出不可解析异常，或在错误输入上仍写出部分 manifest；也可能依赖输入枚举顺序导致诊断顺序漂移。这里是待验证假设，不是已观测模型结果。

## 自动验收设计

- 已建立 `pe-untrusted-metadata-v1/public/starter`、`private/evaluator`、`private/oracle.yaml` 和 `private/reference` 原型；它们仍仅是 candidate 材料。
- `public/starter` 自带 lockfile、fixtures 和 `bun test`/CLI 检查；starter 在私有恶意 metadata 检查上必须失败（产出可加载 manifest、错误退出码或不稳定诊断）。
- `private/reference` 对合法输入保持字节级兼容；对每类非法输入拒绝加载，诊断 JSON 至少含 `file`、`path`、`code`，并按稳定顺序累计独立错误。
- evaluator 运行同一组本地 fixtures，观察退出状态、manifest 是否生成、诊断字段/顺序和输入重排后的等价性；不得依赖网络、数据库或时钟。

功能可用但未遵从目标 Practice 的实现，可能在示例输入上通过却对未知字段、重复错误或重排输入失败；只有通过隐藏边界矩阵及诊断稳定性检查，才可记录为 Practice 遵从证据。最终映射仍需待 Practice oracle 冻结。

## 实现范围

- `public/task.md`、`public/starter/`：最小 CLI、package manifest/lockfile、合法与恶意 fixtures、可运行检查。
- `private/evaluator/`：退出码、manifest 生成、诊断 schema、排序不变性断言。
- `private/oracle/`：contract 字段表、错误 code/path 期望、reference patch；reference 必须通过同一 evaluator。

## 混杂因素、排除条件与风险

- 排除网络、随机 ID、当前时间、环境变量秘密和真实插件生态差异。
- 固定 Bun、输入编码、locale、fixture 顺序和 CLI 参数；不测试性能或日志措辞偏好。
- 风险是把“拒绝未知字段”误当作普适规则，或错误 code 设计本身成为答案泄露；冻结前需评审兼容性与提示去泄露。

## 适用条件

未获得 profile 准入；不得创建或运行 intervention 条件。

## 冻结前 checklist

- [ ] 在 `source-audit.md` 登记并独立审核真实变更、稳定 Practice 和适用边界。
- [x] 已本地确认 starter 在隐藏恶意 fixtures 失败、reference 通过全部 evaluator 检查；未产生或提交运行产物。
- [ ] 确认 prompt 不含 Practice/算法/API 解法词，且 control 等长无关。
- [ ] 固定 runtime、evaluator/oracle 版本和本地 fixtures hash。
- [ ] 生成 snapshot 前完成 review checklist；产生结果后 revision 不再修改。
