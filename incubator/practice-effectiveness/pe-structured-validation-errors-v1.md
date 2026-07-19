# PE Structured Validation Errors v1

- **ID**: `pe-structured-validation-errors-v1`
- **标题**: 多错误边界与结构化诊断
- **来源**: `contract-derived seed`（依据本地 contract 合成；不是生产 issue）
- **实验主张**: 对包含多个相互独立错误的配置，目标 Practice 能比 baseline 更完整、稳定地累计结构化诊断，同时保持成功路径兼容。

## 用户可见任务提示

请完成本地配置检查命令。它读取一个 JSON 配置并在合法时输出规范化配置；配置可能同时违反多个独立约束。工具应报告全部可发现的问题，每项包含字段路径、类别和可读消息；输出顺序必须稳定，不能泄漏堆栈或内部绝对路径。遇到无法解析的 JSON 时返回单一解析诊断；合法输入的输出格式和退出码保持兼容。不得访问外部服务。

题面不指定 fail-fast、异常类、schema 库或收集算法。

## Practice 对照

- **相关 Lorelum Practice**: `MISSING`。需要新增“结构化错误边界/错误累计/敏感信息最小化”Practice，并定义可观察 oracle。
- **无关负对照 Practice**: `MISSING`。需要等长且同权限的无关 control（例如日志颜色一致性）；当前没有库可引用。
- 外部 Vercel Skill 与此 contract 无直接关系，不作相关证据。

## 预期 baseline 失败模式

常见候选失败包括遇到首个错误即停止、把多个错误折叠成一条、路径格式不稳定、将堆栈/绝对路径返回给用户，或成功输出被错误分支污染。需要通过实际 pilot 验证频率。

## 自动验收设计

- starter 对包含两个以上独立错误的 hidden config 应少报、泄漏内部细节或返回非结构化异常，至少触发一项失败；合法 config 检查仍应通过。
- reference 对合法输入保持兼容；对多错误输入返回完整诊断数组（路径/类别/消息），对语法错误只返回解析诊断，退出码符合 contract。
- evaluator 比较诊断集合、路径规范化、稳定排序和敏感信息黑名单，并重复执行确认确定性。

仅有可用退出码并不证明遵从目标 Practice；隐藏多错误、语法错误、路径泄漏和重复执行探针用于区分 fail-fast/不稳定实现，具体“Practice 遵从”需等 oracle 版本化。

## 实现范围

- `public/task.md`、`public/starter/`：配置 CLI、合法/非法 fixtures、lockfile 和本地测试。
- `private/evaluator/`：诊断 schema、累计性、确定性、敏感信息和退出码断言。
- `private/oracle/`：独立约束清单、错误 contract、reference 与 hidden fixtures。

## 混杂因素、排除条件与风险

- 固定 JSON 编码、locale、绝对路径映射和错误 code 表；不比较自然语言风格。
- 排除性能、日志级别和外部 schema 服务；每个 fixture 只改变一类约束组合。
- 风险是错误数量上限与用户体验冲突，或黑名单导致误报；冻结前需产品/安全 review。

## 适用条件

`baseline`、`oracle-practice`、`irrelevant-practice`、`lorelum-retrieval`（检索条件需冻结内容 hash 和 trace）。

## 冻结前 checklist

- [ ] 相关 Practice、负对照和 treatment 已有独立版本/hash。
- [ ] starter 必须在多错误/泄漏探针失败，reference 通过全部 contract。
- [ ] evaluator 不依赖消息措辞，能重跑且只读本地文件。
- [ ] 明确错误上限、退出码和路径脱敏规则，避免题面泄露。
- [ ] review 通过后生成 snapshot；不得修改已出结果的 revision。
