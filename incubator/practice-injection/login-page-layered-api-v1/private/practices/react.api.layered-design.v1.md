---
id: react.api.layered-design
version: v1
title: API 分层设计
delivery_template: practice-card/v1
---

## 目标

让界面组件只处理交互与界面状态，把 API 协议细节收敛到 feature API。

## 做法

1. 组件只能调用 feature API 的公开函数，不直接调用请求适配器。
2. API 层负责请求与响应 DTO 映射，并统一翻译认证失败。
3. 组件依据领域结果或领域错误更新界面，不判断 HTTP 状态或读取原始响应。

## 验收

检查组件导入边界、API 的映射与错误翻译，以及重构后行为保持不变。
