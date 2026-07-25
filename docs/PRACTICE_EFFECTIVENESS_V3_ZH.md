# 中文 Practice 候选设计（v3）

v3 将 Practice 写成 Markdown，将任务题面写成中文，并保留 v2 的候选、注入文本、快照和有效运行结果作为独立历史。它是下一轮 `candidate/pre-incubator` 的探索性输入，不是正式 benchmark，也尚未运行。

## 结构

```text
中文任务题面（public/task.md）
        +
候选 starter 与私有 evaluator
        +
私有验证档案（来源、验收、边界）
        +
私有 Markdown Practice（按场景注入）
```

每条 Practice 都是一个独立 `.md` 文件：front matter 固定 `id`、`version`、`role` 和 `applies_when`；正文依次给出标题、`应当这样做`、`避免` 与 `完成前检查`。这与 Lorelum 的“按需检索小切片”一致，避免把可执行规则埋在 YAML 长字段或全量规则集中。

YAML 只保存计划、候选快照和验证档案。验证档案引用 Practice 文件，但不复制 Practice 正文；执行器在启动前校验 Markdown front matter、全文哈希、长度可比性与 public/private 隔离。

## 六个候选

| 任务 | Agent 要完成的事 | Oracle Practice 的核心验收 |
| --- | --- | --- |
| 收紧本地管理服务的部署配置 | 默认不将未认证管理 API 暴露到所有宿主机网卡 | 显式 loopback 绑定；保留内部端口和可配置宿主机端口 |
| 完善校验结果 API | 返回调用方可展示并可据此决策的结构化校验结果 | 错误阻断；警告与提示保留且不阻断 |
| 完善发布描述文件校验 | 兼容处理当前版本未实现的已声明字段 | 声明保留；返回非阻断兼容反馈；不猜测实现 |
| 完善本地发布前检查 | 阻止决策配置指向不存在的条目 | 每个目标可解析；任一悬空目标阻断发布 |
| 完善本地通知路由选择器 | 从配置中稳定选择预期可用的路由 | 优先级确定；显式排除优先；跳过不可用路由 |
| 完善本地 Webhook 入口 | 让已授权请求通过并拒绝未授权请求 | 先验签原始请求体；失败时不解析、不调用处理器 |

每个 Oracle Practice 都有一条结构和长度可比、但与该任务无关的 Markdown 对照 Practice。对照用于排除“只是多给了一段上下文”的解释，不应被当作产品检索能力。

## 运行边界

`protocol/practice-effectiveness-exploratory/v3/plan.yaml` 保持每任务三条件、每条件两次、合计 36 次的探索设计。可运行的预检命令为：

```sh
bun run exploratory:practice -- preflight --plan v3 --mode local-proxied
```

只有获得新的明确授权后，才可启动 v3 的 36 次模型批次。v3 的中文题面和 Markdown Practice 改变了输入与候选快照，因此它与已完成的 v2、失效的旧 v2 和 v1 都不得混合统计或解释。
