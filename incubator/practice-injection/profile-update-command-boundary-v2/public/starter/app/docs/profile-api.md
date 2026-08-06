# 账户资料接口

账户资料页通过 `/api/profile` 读取与保存当前用户的显示名。

## GET /api/profile

成功（200）：

```json
{ "display_name": "string" }
```

## PUT /api/profile

请求：

```json
{ "display_name": "string" }
```

成功（200）：

```json
{ "display_name": "string" }
```

显示名已被占用（409）：

```json
{ "code": "display_name_taken" }
```