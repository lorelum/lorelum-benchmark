# 项目目录接口

项目目录页通过 `/api/projects` 读取项目列表。

## GET /api/projects

查询参数：

| 参数 | 说明 |
| --- | --- |
| q | 可选，按名称关键词过滤 |

成功（200）：

```json
[ { "id": "string", "name": "string" } ]
```

服务不可用（503）：

```json
{ "code": "unavailable" }
```