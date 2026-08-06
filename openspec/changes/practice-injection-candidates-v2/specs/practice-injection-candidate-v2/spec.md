## ADDED Requirements

### Requirement: v2 candidate 制造 Practice 可观测缺口

每个 v2 candidate revision MUST NOT 预置被测职责的完成实现：starter SHALL 保留传输 adapter（`src/services/http.ts`）与 API 文档，但 MUST NOT 预置领域翻译层或查询资源状态边界；公开任务 MUST 以自然语言声明可观察行为与基本分层要求，使 baseline 有机会产出该行为，而详细约定（response 翻译、原始 response 隔离、显式资源状态）由 Practice 提供。candidate 设计 MUST 记录预期 baseline 符合水平，并 MUST 预期 baseline 在至少一个被测职责维度低于满分（残余 Practice 缺口）；oracle 注入条件 MUST 能补上该缺口；若 pilot 显示 oracle 相对对照无增量，candidate MUST NOT 推进。

#### Scenario: baseline 存在残余缺口
- **WHEN** baseline 条件（无注入）基于占位 starter 完成 v2 task
- **THEN** 职责探针记录 baseline 存在至少一个被测职责缺口，且语义硬门槛仍可判定

#### Scenario: 注入能补上缺口
- **WHEN** oracle-practice 条件收到被测规范并完成同一 task
- **THEN** 职责探针记录缺失职责被满足

### Requirement: 产品代码无测试埋点

v2 candidate 的产品代码与公开测试 MUST NOT 依赖或暴露 `window.__*` 之类的测试计数：传输 adapter 与组件 MUST NOT 写入产品内埋点；公开测试 MUST 通过网络拦截（`page.route`）stub API 并据此断言请求次数与行为，不得读取产品内部状态。

#### Scenario: 公开测试独立于产品内部
- **WHEN** 测试验证「保存/查询期间只发起一次请求」
- **THEN** 断言基于网络层拦截计数，产品代码不含 `window.__*` 或等价埋点

### Requirement: 环境不暴露测试痕迹

candidate workspace 与 prompt MUST NOT 揭示 benchmark 运行：`public/` 与 agent 可见材料不得出现评分、rubric、hash、condition、evaluator 或评测字样，运行 MUST NOT 向 agent 询问测试或暴露测试意图。

#### Scenario: agent 只看到真实工程
- **WHEN** agent 检查 v2 workspace 与 prompt
- **THEN** 它看到的是正常项目（工单式 task、带 git 历史与工程上下文的 starter），无 benchmark 痕迹

### Requirement: Practice 以项目内规范条件化注入

Practice MUST 以项目内规范（`docs/frontend-guide.md`）形态呈现，并 MUST 条件化：baseline 不收到任何规范，irrelevant-practice 只收到其声明的无关对照规范，oracle-practice 收到被测规范。规范 MUST NOT 进入共享 starter；公开痕迹 MUST 只记录规范版本与 hash。

#### Scenario: oracle 看到项目内规范
- **WHEN** oracle-practice 条件运行
- **THEN** 被测规范以项目文档形式存在于 workspace；baseline 无任何规范，irrelevant 只含其对照规范

### Requirement: 职责可解释探针与模型运行前校准

v2 私有质量探针 MUST 按职责断言（required responsibilities / forbidden responsibilities），名称无关地接受职责等价实现，并 MUST 在任何模型调用前完成固定样例校准：reference 与 equivalent（不同命名/结构但职责等价）通过、anti-pattern（组件直连 transport 读原始响应）拒绝、public-starter（占位）存在缺口。校准样例、probe 与断言 MUST 保持 private；探针或 Practice 修改后 MUST 重新校准并更新 snapshot。

#### Scenario: 等价实现校准
- **WHEN** 维护者为 v2 探针提交校准样例
- **THEN** reference 与职责等价样例通过，anti-pattern 与绕过样例失败，public-starter 记录缺口

#### Scenario: 校准未通过
- **WHEN** 探针拒绝职责等价样例或接受声明绕过
- **THEN** 该 candidate 不得进入模型比较，直到探针/断言修正并重新校准

### Requirement: 新 revision 身份与历史保留

v2 candidate MUST 作为独立修订存在（独立 source/snapshot/profile 身份），MUST NOT 改写 v1 candidate、#91/#125 执行计划或 scratch 结果；本 change 不得调用模型、创建正式 record 或升级 suite revision。

#### Scenario: v1 与历史结果不动
- **WHEN** 实现完成两个 v2 candidate
- **THEN** v1 目录、#91/#125 计划与 scratch 结果保持不变，v2 有独立 snapshot 与条件身份

#### Scenario: 不创建正式产物
- **WHEN** v2 candidate 完成校准与验证
- **THEN** 未执行模型调用、未创建正式 record、未进入默认 suite
