# 认证接口

管理后台前端通过 `POST /api/session` 建立登录会话。

## POST /api/session

请求：

```json
{
  "email": "string",
  "password": "string"
}
```

成功（200）：

```json
{
  "user": {
    "id": "string",
    "display_name": "string",
    "role": "string"
  }
}
```

认证失败（401）：

```json
{
  "code": "invalid_credentials",
  "message": "邮箱或密码错误"
}
```
