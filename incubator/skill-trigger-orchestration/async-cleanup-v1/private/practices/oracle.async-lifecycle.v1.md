---
id: react.async-lifecycle
title: React 异步副作用生命周期
stage: effect-cleanup
tech_stack: [react, typescript]
applies_when: 当 React 组件在 useEffect 中发起异步请求并处理其响应时。
severity: warn
delivery_template: practice-card/v1
---

# React 异步副作用生命周期

## 建议

1. 让组件的异步副作用在组件卸载后不再影响状态；在 effect 返回的清理函数中使后续响应失效。
2. 使用可取消的信号或已挂载标志，在清理时标记请求结果不再适用。
3. 仅在结果仍有效时更新状态，避免卸载后写入。

## 常见反模式

- 在 useEffect 中发起请求并直接 setState，不返回清理函数。
- 清理函数为空，请求仍在途时组件卸载导致状态写入。
- 将请求移到组件外但未取消，卸载后仍处理响应。
