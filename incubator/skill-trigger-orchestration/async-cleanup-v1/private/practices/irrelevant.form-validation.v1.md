---
id: react.form-validation
title: React 表单校验
stage: form-submit
tech_stack: [react, typescript]
applies_when: 当 React 表单在提交前需要对字段进行客户端校验时。
severity: warn
delivery_template: practice-card/v1
---

# React 表单校验

## 建议

1. 让表单在提交前对必填字段进行客户端校验，给出可操作的错误提示。
2. 使用稳定的字段标识组织校验规则，把校验逻辑收敛到可复用模块。
3. 仅在字段值变更或提交时触发校验，避免每次渲染都重算。

## 常见反模式

- 提交前不校验，直接把空值或非法值发给服务端。
- 将校验规则分散在多个组件中，难以复用与测试。
- 每次渲染都执行校验，造成不必要的性能开销。
- 把校验错误信息硬编码在组件内，无法集中维护与本地化。
