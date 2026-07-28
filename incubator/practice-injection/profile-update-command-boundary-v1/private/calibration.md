# 校准记录

不调用模型。public starter 与 anti-pattern 通过公开资料页语义但必须失败命令边界 probe；anti-pattern 仅经由薄 client 转发原始 response，仍由组件读取 transport 细节。reference 与不同命名、不同目录和不同领域结果形状的 equivalent fixture 必须通过。任何结果不符即拒绝 candidate。

从 candidate 根目录运行 `bun run private/calibration/run.ts` 可重放四项矩阵。驱动会在每个 fixture
缺少依赖时运行 `bun install --frozen-lockfile`；首次运行前须为其安装 Chromium（在每个 fixture
目录运行 `bunx playwright install chromium`）。驱动要求四项公开语义均通过，且 starter/anti-pattern
的 probe 为 `fail`、reference/equivalent 的 probe 为 `pass`。

通过 kernel 重放时，`calibration_roles` 的 `{{candidate_path}}` 由 kernel 替换为候选源码绝对路径；
私有 driver 只在校准进程中读取该路径，不会进入 materialized workspace。
