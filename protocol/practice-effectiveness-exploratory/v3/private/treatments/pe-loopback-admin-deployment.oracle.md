---
id: pnotify-loopback-deployment-oracle-v3
version: v3
role: oracle-practice
applies_when: Compose 部署发布未认证管理接口，且默认配置会暴露宿主机端口。
---

# 未认证管理接口仅限本机

## 应当这样做

默认将宿主机绑定显式限制为 loopback；保留服务内部端口和可配置的宿主机端口。外部访问交由独立管理的 TLS 反向代理，而非直接扩大容器端口暴露。

## 避免

- 不要省略宿主机绑定。
- 不要修改服务内部端口。
- 不要把反向代理当作容器内的隐式假设。

## 完成前检查

检查端口映射、默认绑定和示例访问说明是否相互一致。
