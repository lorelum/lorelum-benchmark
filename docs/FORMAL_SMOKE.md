# 正式 G0/G1 Smoke 运行手册

当前 formal smoke workflow 已撤下，仓库中没有可生成请求或记录的历史计划。真实 Next
仓库候选尚处于离线校准阶段；只有三份预注册问题全部冻结、source commit、不可变模型
快照、隔离 runner 与不可变 artifact storage 全部就绪后，才能新建 workflow 和正式计划。

## 启动前配置

1. 提交并验证冻结的真实仓库任务源树，使用新 commit 创建正式计划；从 DeepSeek 获取不可变模型快照 ID，并将该值同时写入 `environments/formal-pi-deepseek-v4-pro/v1/environment.yaml` 与新计划的 `model.version`。不得使用 `pending-provider-snapshot` 执行真实运行。
2. 创建启用 versioning 和默认 Object Lock retention 的 S3 bucket/prefix。将固定的 `s3://bucket/prefix` 写入 formal environment 的 `artifact_storage.uri`，并将完全相同的值配置为 GitHub Environment variable `LORELUM_ARTIFACT_STORAGE_URI`。
3. 合并后由 `Publish formal Pi container image` 发布镜像。将 workflow 输出的 digest 写回 formal environment；不得使用 image tag。注册带 `lorelum-formal-sandbox` 标签的 Linux 自托管 GitHub Actions runner，并由 runner 服务环境设置 `LORELUM_SANDBOX_ENFORCED=1`；workflow 使用临时 `GITHUB_TOKEN` 拉取 digest，不将 registry 凭据传给 Pi。
4. 创建 Docker 内部网络 `lorelum-formal-egress`，并部署只允许 `api.deepseek.com:443` 的 CONNECT proxy；Pi 容器不得拥有 host network、Docker socket 或 checkout 挂载。
5. 允许 self-hosted runner 的宿主进程访问 `github.com`，或预热 `.lorelum-cache/treatments/` 中 hash 固定的 Vercel Skill bundle；该访问只发生在 Pi 容器启动前。Pi 容器仍只允许经 proxy 访问 `api.deepseek.com:443`。
6. 在 GitHub Environment `formal-g0-g1` 配置 `DEEPSEEK_API_KEY` secret、`AWS_ROLE_TO_ASSUME` 与 `AWS_REGION` variables。OIDC 角色只授予该 bucket/prefix 的 `PutObject`、`HeadObject` 和对象版本读取权限。

## 执行与复核

1. 基于新计划恢复 workflow 后，先运行 `dry-run`；它必须通过真实仓库离线校准、契约测试、请求生成、coordinator preflight 与 self-hosted Docker sandbox probe。
2. 再运行真实 smoke。coordinator 会先上传每项产物，核验 S3 version ID、SHA-256 与 Object Lock，随后才生成 run manifest 和 record。
3. 真实运行必须为 `results/records/` 创建独立 draft PR。合并前检查每个 record 的 `run_kind=smoke`、`experiment_plan_hash`、模型快照、S3 `versionId` URI 与所有 SHA-256。
4. smoke PR 不用于正式结论。全部任务满足可追溯性和 G0/G1 仅 treatment 不同后，才创建正式三次重复实验计划。
