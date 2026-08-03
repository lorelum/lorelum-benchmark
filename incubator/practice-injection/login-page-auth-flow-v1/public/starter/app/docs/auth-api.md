# 认证接口

管理后台前端通过 `POST /api/session` 建立登录会话。底层请求方法位于
`src/api/http.ts`。

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

## 约定

- 成功时返回当前登录用户；失败时返回 `code` 与面向用户的 `message`。
- 认证失败应在前端边界模块内翻译为领域错误或领域结果，组件不读取原始传输
  状态码或响应体。
