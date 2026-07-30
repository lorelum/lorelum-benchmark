## MODIFIED Requirements

### Requirement: 质量 probe 必须在模型运行前校准

每个 Practice candidate 的私有质量 probe MUST 在任何模型调用前，以固定样例证明能够接受 reference、接受职责等价实现并拒绝至少一个已声明 anti-pattern 或绕过实现。校准样例、probe 和断言 MUST 保持 private；候选源、probe、Practice 或 evaluator runtime closure 修改后，维护者 MUST 重新运行校准并更新对应 candidate snapshot。无法构造职责等价通过样例的断言不得作为质量失败条件，除非其已升级为公开接口合同。

校准使用的 evaluator runtime MUST 是 candidate 声明、版本化且完整性受保护的 private 输入。它
不得从仓库祖先目录、全局 Bun/Node 安装或环境偶然状态解析依赖；缺失或无法验证的 runtime
输入必须 fail closed，并保持为 evaluator execution failure，而不是语义或质量信号。

#### Scenario: 等价实现校准
- **WHEN** 维护者为一个质量 probe 提交校准样例
- **THEN** reference 与使用不同内部结构的职责等价样例 MUST 通过，已声明 anti-pattern 或绕过样例 MUST 失败

#### Scenario: 校准未通过
- **WHEN** probe 拒绝职责等价样例或接受已声明绕过
- **THEN** 系统 MUST 阻止该 candidate 进入模型比较，直到 probe 或断言被修正并重新校准

#### Scenario: 校准 runtime 无法验证
- **WHEN** candidate 的 evaluator runtime closure 缺失、遭篡改、版本不匹配或试图解析宿主依赖
- **THEN** 系统 MUST 阻止该 candidate 进入模型比较，并记录非健康 runtime failure；不得把该结果解释为 Practice 质量信号或负向语义证据
