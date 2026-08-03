## Context

#91 第二 candidate 诊断出现 `http://127.0.0.1:4173 is already used`：候选
`public/starter/app/playwright.config.ts` 固定端口 4173 并自启内置 webServer，
前一次 evaluator 遗留的 Vite/Playwright 子进程占用端口后，后续 attempt 启动失败。
仓库的 Pi 路径（`execute.ts`/`coordinator.ts`）已有进程树清理（Windows
`taskkill /T /F`，Linux 递归 pgrep/SIGTERM），但 profile diagnostic runner 使用的
`preflight.ts` `run` 超时仅 `child.kill()`，会遗留 WebServer 子进程。

该失败被当作 candidate/Practice 失败读入，扭曲诊断结论。Issue #134 要求每次 attempt
的 WebServer、Playwright worker 与 evaluator 独立启动/结束/清理，端口冲突或残留进程
不得进入比较。

## Goals / Non-Goals

**Goals:**

- 每次诊断 attempt 的 evaluator WebServer 使用独立端口，连续 attempt 不冲突。
- evaluator 正常退出、失败、超时后都清理子进程（Windows 与 Linux）。
- 启动失败、依赖失败、超时使用稳定脱敏分类，不产生语义/质量结论。
- 保留 public-only workspace 与 private evaluator 边界，不改 candidate 文件。
- 无法确认清理状态时记录 `execution-failed`，不进入比较。

**Non-Goals:**

- 不修改登录页题面、Practice、Oracle 或质量 rubric；不改候选
  `playwright.config.ts`/`vite.config.ts` 与 snapshot。
- 不重跑 #91 已完成结果；不改历史 record；不产生新 record。
- 不改写 evaluator-result/v2、冻结 helper 或现有 candidate 私有 evaluator 语义。
- 不引入模型调用或新实验。

## Decisions

### 独立端口 + 受控 supervisor（默认推荐，待规划确认）

方案 A（推荐）：profile diagnostic runner 在每次 attempt 为 WebServer 分配独立端口
（绑定 `127.0.0.1:0` 取空闲端口后释放），由 supervisor 启动
`bun run dev -- --host 127.0.0.1 --port <port>`，轮询 URL 就绪后设置
`PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port>` 运行 evaluator，随后在 finally 中终止
server 进程树。候选 `playwright.config.ts` 已支持 `PLAYWRIGHT_BASE_URL` 外部 URL 且
禁用内置 webServer，因此无需改动候选文件。

方案 B（备选）：保留 Playwright 内置 webServer，但把端口改为动态分配并注入环境变量。
该方案仍需受控启停，且对候选配置耦合更高，故不推荐。

两种方案都必须 fail closed：端口分配失败、server 启动失败/超时、清理无法确认时记录
`execution-failed` 稳定类别，不产生语义/质量结论。

### 统一进程树清理

将 `execute.ts`/`coordinator.ts` 已验证的进程树终止逻辑抽为共享 helper
（Windows `taskkill /PID <pid> /T /F`；Linux 递归 pgrep `-P` + SIGTERM），供
`preflight.ts` 的 `run` 与 evaluator supervisor 复用。超时与 evaluator 结束均触发
清理；清理失败/无法确认端口释放时记录 `evaluator-cleanup-unverified`。

### 稳定脱敏失败分类

新增/保留稳定类别并映射到 `evaluation_status=execution-failed`（error 字段）：
`evaluator-server-port-unavailable`、`evaluator-server-launch-failed`、
`evaluator-server-timeout`、`evaluator-launch-failed`（现有）、
`evaluator-timed-out`（现有）、`evaluator-exit-nonzero`（现有）、
`evaluator-cleanup-unverified`。不包含端口号、私有路径、命令输出。

## Risks / Trade-offs

- [动态端口竞态（释放后被占用）] → supervisor 启动后轮询就绪并在失败时重试一次，
  仍失败则 fail closed。
- [Windows 进程树清理不彻底] → 复用已验证的 `taskkill /T /F`，并用端口释放探测
  验证清理。
- [supervisor 增加 evaluator 启动复杂度] → 保持独立模块与聚焦测试，不侵入
  candidate 私有 evaluator 语义。
- [清理状态无法确认] → 记录 `execution-failed` 且不进入比较（issue 验收口径）。

## Migration Plan

1. 创建本 OpenSpec-only PR（仅 artifacts），引用 #134，通过 strict validation。
2. 规划澄清：确认方案 A（独立端口 + supervisor）vs 方案 B；确认失败分类命名。
3. 实现共享进程树清理、supervisor、端口注入与聚焦测试；不改候选文件。
4. 运行 `bun run test:pi:v2`、`bun run validate`、OpenSpec strict validation、
   `git diff --check`，保留证据。
5. 不重跑 #91 结果、不创建 record。

回滚：删除 runner/supervisor 改动与测试即可；候选、evaluator-result/v2、历史记录不变。

## Open Questions

- 采用动态端口 + 受控 supervisor（推荐），还是保留 Playwright 内置 webServer 动态端口？
- 失败分类是否沿用现有 `execution-failed` 枚举 + 稳定 error 类别（推荐），还是新增
  独立 `evaluation_status` 状态？

## Resolved Questions

- 端口方案：确认采用动态端口 + 受控 supervisor（runner 分配空闲端口、启动
  server、轮询就绪、注入 `PLAYWRIGHT_BASE_URL`、finally 终止进程树；候选文件
  零改动）。
- 失败分类：确认沿用 `evaluation_status=execution-failed` 枚举 + 稳定脱敏 error
  类别（`evaluator-server-port-unavailable`、`evaluator-server-launch-failed`、
  `evaluator-server-timeout`、`evaluator-launch-failed`、`evaluator-timed-out`、
  `evaluator-exit-nonzero`、`evaluator-cleanup-unverified`），不新增独立状态。

## Planning Confirmation

Requirements owner confirmed after the OpenSpec-only PR (#140) and planning
clarification, without a comment on issue #134:

- 动态端口 + 受控 supervisor；候选 `public/starter/app/playwright.config.ts` 与
  `vite.config.ts` 及其 snapshot 保持不变（候选配置已支持外部 base URL 并禁用
  内置 webServer）。
- 失败沿用 `execution-failed` 枚举 + 稳定脱敏类别，不新增独立状态；启动失败不
  产生语义/Practice/joint-pass 结论。
- 不修改登录页题面、Practice、Oracle 或质量 rubric；不重跑 #91 已完成结果；
  不改历史 record；不产生新 record；不改写 `evaluator-result/v2`、冻结 helper。