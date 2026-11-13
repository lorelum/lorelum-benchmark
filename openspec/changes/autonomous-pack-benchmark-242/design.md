# Design

## Context

#242 的目标与现有 `pack-practice-treatment/v1` 不同：后者预先固定 query 和 Practice，staged runner 注入结果。不能将该路径重命名为自主检索。#222 的静态排名轨道独立保留。用户确认首个对象是 `E:/lorelum-packs/packs/agentic-coding` 当前本地工作树，包含未提交内容；必须冻结实际内容快照及 digest，不能将 Git commit 或 pack.yaml 版本单独视为内容身份，也不能将其称为已发布版本。

## Goals / Non-Goals

目标是对同一任务执行 Pack 安装与空 Store 的端到端配对，区分自主检索、最终功能和质量。非目标：改写历史任务或结果、制作用户的 Pack、单凭调用率证明效果、默认启动付费模型或产生正式结果。

## Decisions

1. **条件**：两组均安装同版本 Lore CLI，暴露相同调用方式和通用工具说明；基线为空 Store，处理组仅多安装固定 Pack。不得在 task 或系统提示中加入题目专属查询指令；预先建立可用语义索引，固定 profile、模型、运行时和版本。Pack 带来的可观察差异是 treatment 本身，不能声称完整模型输入逐字相同。独立目录和环境隔离宿主已有 Pack、缓存及凭据；禁止私有评测材料被访问。预算和工具权限保持相同。
2. **身份与执行**：`schemas/` 定义实验、条件与观测的版本化契约；计划记录 Pack 来源及完整实际内容快照、digest、安装及索引身份；`environments/` 固定 CLI、Agent、profile 和依赖；`src/benchmark/` 增加独立执行与观测路径，复用既有工作区和结果契约。安装或索引不匹配、输入不一致、隔离失败及运行 trace 不可用不得记作有效比较；仅检索行为无法从轨迹完整判定，不单独否定功能比较。本地工作树试验须可依据保存的完整快照重建，禁止覆盖源仓库或把不匹配内容冒充 release。
   自主对照以 `autonomous-pack-plan/v1` 作为版本化条件清单，`treatments/README.md` 说明其与 Pi v2 Practice 注入的区别；具体 Pack 和索引身份由每次计划固定，不创建预选 Practice 的 treatment。
3. **任务**：`incubator/` 中建立多文件、真实维护场景的候选，产品行为可客观验证，有不止一种合理架构方案；公共题面、starter 独立于 Pack 和评估标准。私有 evaluator、oracle、校准和 blind rubric 留在 `private/`。分别使用合理解、缺陷解及不同合理设计校准，避免质量探针惩罚等价设计。现有有结果 revision 和 helper 不变。是否冻结正式 snapshot 取决于生命周期门禁。
4. **观测与评估**：记录普通 Agent 轨迹中可见的 query/get 调用及结果状态、时间顺序和 Practice 身份，并限制敏感日志；非查询、空结果、失败、trace 缺失分开。独立报告 health、semantic、质量探针、条件盲审、成本与延迟；judge 只作软信号，确定性语义检查不是 LLM judge。查询是过程观察，不作为任务完成门槛，也不能单独证明因果机制。
   用户选择保留 Agent shell 中的原生 Lore CLI，并确认简化为普通运行轨迹：不要求 eBPF、进程级系统审计或更改 CLI 输出管道。shell 可以绕过专用工具，故无法证明覆盖时检索状态保持不可判定，不得当作未查询；功能结果与检索证据分别解释。
5. **实验**：预注册任务、条件、重复数和随机化顺序；配对同任务及固定配置，报告完整分母、失败和不确定；不把随机配对 seed 误称模型 seed。固定 task/source snapshot、evaluator、Pack、索引、environment、模型和输入 hash。pilot 与正式记录分开；未经生命周期、隔离审计和授权不执行模型调用或创建正式 record。

   用户取消严格总 token 上限：不因供应商缺少请求前计数/上界而阻止运行，也不人为设置 token 硬上限。按服务返回的 usage 分别记录输入、输出、总量及费用；缺失或异常保留不可用状态，不能估算后冒充真实用量。两组使用相同时间和轮次预算，并在文档中说明不存在严格 token 费用封顶。
   用户确认针对供应商明确返回的 `Concurrency limit exceeded for user, please retry later` 做有限退避重试：仅在流式响应首个事件即为该错误、尚未向 Agent 交付任何响应时重试；最多额外尝试三次，每次计入原有请求预算，两组完全相同。其他错误、已开始响应、超时和预算耗尽均不掩盖；中断或不完整用量保持不可用。记录新代理镜像身份，历史 pilot 不改写。
6. **文档**：更新 `docs/README.md` 阅读地图，增加面向使用者的 bench 指南，覆盖准备固定 Pack、隔离环境、设计候选及私有校准、dry-run、授权后执行、trace 和结果解读；只写实际实现的命令。

## 可复用框架的已确认方向

用户确认目标是供贡献者扩展的编码 Agent 测评框架，不以证明某个 Pack 有效或统一质量评分作为完成条件。新增任务、Pack 不应要求修改 runner。退款候选和现有 v1 pilot 作为历史示例保留，不改写其输入、helper 或结果。

任务声明分别绑定公开题面与 starter、版本化任务运行环境、私有 verifier 和校准身份。框架复用现有 Pack 快照、配对调度和观测语义；Pi 为首个真实 Agent adapter，不承诺任意模型协议或其他 Agent 已可用。功能验收由任务 verifier 定义，质量结果可选、独立表达，缺失不得伪造成零分或成功。

Agent 完成并停止后，候选代码仍不可信；私有 verifier 与候选执行分离，候选在无网络受限环境中运行，不能访问 verifier、oracle 或可信结果文件。任务作者提供的 verifier 为受信任输入，候选与 verifier 的有限请求/响应由框架中介；传输、启动、超时及无效输出不能误判为产品语义失败。不能直接调用会在宿主执行命令并继承宿主环境的 `kernel/core/v1` 校准函数来运行候选代码。现有 kernel 哈希与 `autonomous-pack-tree/v1` 的完整树摘要不同，不得互换。

新增版本化声明、运行/结果契约及贡献者入口，复用现有能力而不为未实现的 Agent 或语言添加空 adapter。完整 Pack 快照及可复现身份由操作者在受控 artifact 存储保存；可分享内容与私有 verifier/轨迹分开，凭据不写入交接包或 Git。

验收须用不同技术栈的两个实际编码任务证明新增任务无需改 runner，合理实现通过、缺陷实现失败；同一配置可执行安装 Pack 与空 Store 的离线端到端配对，并保留失败和检索不确定性。示例与合成 Agent 证明扩展链路，不证明任何 Pack 的效果。正式结果仍遵循独立生命周期，不因本变更自动产生。

## Risks / Trade-offs

- 空 Store 不等价于禁用 Lore：两组工具完全一致，空结果本身是预期 treatment 后果；避免误认检索质量。
- 安装 Pack 会改变检索返回及模型后续上下文；一致性要求适用于初始 task 和非 treatment 设置，不可能要求全程 token 一样。
- 盲审仍可能偏好某种风格；需公开 rubric、对不同合理解校准，并单独报告不确定性，不使用隐藏总分。
- Agent 可能从不调用 Lore；应如实报告，而不是强制调用。如何让自然工作流发现 Lore 需两组完全相同的通用设置，不得额外向处理组提示。
- 新 stable capability 的各项约束分别约束可复现比较、检索真实性及评估隔离，均独立于具体 Pack、任务和模型；其余样本量、具体路径与任务选择留在本变更。

## Verification

严格 OpenSpec validation；实现后运行 `bun run validate`、相关 contract tests 和不依赖外部模型的真实执行 smoke，核验输入 hash、隔离、空 Store、安装身份、trace 与失败状态；真实模型使用须满足环境、安全及授权门禁，不能以 mock 输出冒称真实自主行为。
