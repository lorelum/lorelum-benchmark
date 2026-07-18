# 正式 G0/G1 Smoke 运行手册

`formal-smoke.yml` 仅通过手动触发运行。`dry-run` 不需要模型密钥，`smoke` 会对两个 direct 任务分别执行 G0/G1 一次，并将 record 提交到独立草稿 PR。

## 启动前配置

1. 从 DeepSeek 获取不可变模型快照 ID。在没有任何正式 record 前，将该值同时写入 `environments/formal-pi-deepseek-v4-pro/v1/environment.yaml` 与两个 G0/G1 实验计划的 `model.version`；不得使用 `pending-provider-snapshot` 执行真实运行。
2. 创建启用 versioning 和默认 Object Lock retention 的 S3 bucket/prefix。将固定的 `s3://bucket/prefix` 写入 formal environment 的 `artifact_storage.uri`，并将完全相同的值配置为 GitHub Environment variable `LORELUM_ARTIFACT_STORAGE_URI`。
3. 合并后由 `Publish formal Pi container image` 发布镜像。将 workflow 输出的 digest 写回 formal environment；不得使用 image tag。注册带 `lorelum-formal-sandbox` 标签的 Linux 自托管 GitHub Actions runner，并由 runner 服务环境设置 `LORELUM_SANDBOX_ENFORCED=1`；workflow 使用临时 `GITHUB_TOKEN` 拉取 digest，不将 registry 凭据传给 Pi。
4. 创建 Docker 内部网络 `lorelum-formal-egress`，并部署只允许 `api.deepseek.com:443` 的 CONNECT proxy；Pi 容器不得拥有 host network、Docker socket 或 checkout 挂载。
5. 在 GitHub Environment `formal-g0-g1` 配置 `DEEPSEEK_API_KEY` secret、`AWS_ROLE_TO_ASSUME` 与 `AWS_REGION` variables。OIDC 角色只授予该 bucket/prefix 的 `PutObject`、`HeadObject` 和对象版本读取权限。

## 执行与复核

1. 先手动触发 `Run formal G0/G1 smoke`，选择 `dry-run`；它必须通过夹具校准、契约测试、请求生成、四个 coordinator preflight 和 self-hosted Docker sandbox probe。
2. 再选择 `smoke`。coordinator 会先上传每项产物，核验 S3 version ID、SHA-256 与 Object Lock，随后才生成 run manifest 和 record。
3. workflow 会为 `results/records/` 创建独立 draft PR。合并前检查每个 record 的 `run_kind=smoke`、`experiment_plan_hash`、模型快照、S3 `versionId` URI 与所有 SHA-256。
4. smoke PR 不用于正式结论。两个任务都成功且 G0/G1 除 treatment 外完全一致后，才创建扩展 smoke 和正式三次重复实验计划。
