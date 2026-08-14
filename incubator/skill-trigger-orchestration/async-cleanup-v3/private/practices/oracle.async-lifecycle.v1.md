---
id: react.async-result-ownership
title: React 异步结果归属
stage: effect-result-ownership
tech_stack: [react, typescript]
applies_when: 当 React 组件因当前范围变化在 useEffect 中发起异步请求并处理其响应时。
severity: warn
delivery_template: practice-card/v1
---

# React 异步结果归属

## 建议

1. 范围变化或组件卸载后，旧范围结果不得影响状态；在 effect 清理时使旧结果失效。
2. 使用可取消信号、失效标记或请求代次，标记旧范围结果失效。
3. 仅在结果仍属于当前范围时更新状态，成功和失败终态均须遵守。

## 常见反模式

- 在 useEffect 中发起范围相关请求并直接 setState，不返回失效机制。
- 清理函数为空，旧范围请求仍在途时覆盖当前范围状态。
- 只阻断成功响应，旧范围请求失败时仍处理错误状态。
