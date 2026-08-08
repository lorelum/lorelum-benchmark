# 独立验证报告（#151 两个 v2 candidate）

- 验证人：独立 agent（与实现 agent 分离）；HEAD `d2d8496`（验证时点）。
- 承诺：只读，未修改被跟踪文件、未提交。
- 重放命令：
  - 语义测试（每个 candidate 的 public/starter/app）：`bun install --frozen-lockfile` + `bun run test`（pristine starter 按设计失败；套用 reference 实现的临时副本全过）。
  - 探针矩阵：`bun run src/benchmark/kernel/kernel.ts calibrate <candidate> --output <临时目录>`。
  - judge 校准：`LORELUM_JUDGE_REAL=1 LORELUM_CALIBRATION_SET_KEY=quality-probe/v1 LORELUM_CALIBRATION_FIXTURES=reference,equivalent,anti-pattern bun run src/benchmark/judge/judge-agent/generic/v1/calibrate.ts <candidate>`。

---
独立验证报告（只读，未改动任何被跟踪文件、未提交）
验证对象：incubator/practice-injection/profile-update-command-boundary-v2、incubator/practice-injection/project-directory-resource-state-v2（分支 codex/practice-injection-candidates-v2，HEAD d2d8496）
环境说明：bun 1.3.1 / node v22.21.0。本机 4173 端口被 QQMusic 占用，导致 Playwright webServer 首次启动超时（环境问题，非 candidate 缺陷）；已改为「手动起 Vite 于空闲端口 + PLAYWRIGHT_BASE_URL 指向它」重跑，仍是真实 Vite dev server + Playwright Chromium + page.route 拦截 API，测试有效性不受影响。
1. 语义测试（真实环境）— 预期需修正
按要求对 public/starter/app 执行 bun install --frozen-lockfile + bun run test。pristine starter 上并非「2 个测试全过」，而是按设计失败（两个 candidate 的 baseline_expectation.functional: false、校准矩阵 public-starter semantic=fail 均如此声明）；「2/2 全过」只有在正确实现后才成立。测试套件本身有效：套用 reference 实现的临时副本全部通过。
candidate 1：profile-update-command-boundary-v2
安装（成功）：
$ bun install --frozen-lockfile
74 packages installed [2.05s]
pristine starter 测试（真实 Vite :5199 + page.route）：
Running 2 tests using 1 worker
  x  1 [chromium] › tests\profile.spec.ts:20:1 › 加载资料并保存显示名 (5.4s)
  x  2 [chromium] › tests\profile.spec.ts:31:1 › 校验显示名、显示冲突且保存期间只发起一次请求 (5.3s)
  2 failed
Error: expect(locator).toHaveValue(expected) failed
    Locator:  getByLabel('显示名')
    Expected: "Ari"
    Received: ""
    14 × locator resolved to <input value="" name="displayName"/>
原因：src/LoginPage.tsx 为占位组件（仅 useState("")，不调用 getProfile），输入框始终为空 → 与 candidate 声明的占位基线一致。
reference 实现对照（临时副本套 profileGateway.ts+LoginPage.tsx，仓库未动）：
Running 2 tests using 1 worker
  ok 1 … › 加载资料并保存显示名 (764ms)
  ok 2 … › 校验显示名、显示冲突且保存期间只发起一次请求 (1.5s)
  2 passed (3.1s)
candidate 2：project-directory-resource-state-v2
安装成功（74 packages installed [1350.00ms]）。pristine starter 测试：
Running 1 test using 1 worker
  x  1 [chromium] › tests\directory.spec.ts:19:1 › 搜索、空结果和重试恢复项目目录 (5.4s)
  1 failed
Error: expect(locator).toBeVisible() failed
    Locator: getByText('Orbit')
    Expected: visible  (element(s) not found)
reference 实现对照（临时副本套 directoryQuery.ts+LoginPage.tsx）：
  ok 1 [chromium] › tests\directory.spec.ts:19:1 › 搜索、空结果和重试恢复项目目录 (1.5s)
  1 passed (2.3s)
发现（与预期不符）：
① 两个 pristine starter 均按设计「测试失败」（占位未接通），与「预期每个 2 个测试全过」不一致；「全过」仅在 agent 正确实现后成立。这与 candidate 自身 baseline_expectation.functional: false 及 private/calibration.md 矩阵声明一致，测试套件本身无缺陷（reference 实现通过）。
② candidate 2 只有 1 个测试（directory.spec.ts 中 1 个 test(），不是 2 个；candidate 1 为 2 个。
2. Agent 视角真实性审计 — 通过（2 个轻微发现）
public/task.md：真实工单口吻（「账户资料页现在加载不出当前显示名，保存也没反应……改完跑下测试。」），无可观察行为/分层提示以外内容，改完跑下测试 属允许的工单用语。✓
public/starter/app/：正常工程形态——package.json（dev/build/preview/test 脚本，react 19.2.3、vite 7.1.7、@playwright/test 1.61.1、node 22.19.x）、playwright.config.ts（chromium、webServer 起 dev server、trace retain-on-failure）、标准 tsconfig×3、vite.config.ts、.gitignore、index.html（管理控制台）、styles.css、src/main.tsx、占位 src/LoginPage.tsx、src/services/http.ts 请求封装、docs/profile-api.md/projects-api.md 接口说明、tests/*.spec.ts（page.route 拦截 + 可访问名称/角色断言）。✓
private/execution/git-history.yaml：identity ops-admin <ops@meridian.internal>；4 个 commit 演进自然：chore: scaffold Vite React account console → feat(api): add profile/projects endpoint client and API docs → test: cover the … flow with Playwright → feat: … page shell awaiting wiring。✓
发现（轻微，非泄露）：最后 commit「shell awaiting wiring」的 files: []，且 src/LoginPage.tsx 未出现在任何 commit 的 files 列表；与文件头注释「last commit 以 add -A 捕获全部剩余文件」存在文档不一致（若 materialize 按 add -A 执行，shell 文件实际会进最后 commit）。
发现（轻微，真实性提示）：package.json 的 name 直接等于 candidate id（如 profile-update-command-boundary-v2），agent 工作区可见；真实项目通常用中性名（如 account-console）。不含 benchmark 关键词，非直接泄露，但建议中性化以避免身份痕迹。
3. 泄露审计 — 通过
对两 candidate 的 public/（task.md + starter/app，排除 gitignore 运行产物）扫描 benchmark/rubric/oracle/evaluator/calibration/practice/LORELUM/injection/kernel/candidate/baseline/condition/snapshot/sha256/hash/judge/score/eval/llm/agent/model/frontend-guide 及中文 评分/评测/基准/校准/泄露/实验/对照/盲评/注入：
无真实命中。唯一命中均为误报：bun.lock 中 npm 包名 baseline-browser-mapping（browserslist 的真实依赖）、sha512-… 完整性哈希串（随机串内含 llm 子串）——注册表锁文件内容，非 benchmark 痕迹；
profile.spec.ts 中 toHaveValue/evaluate 方法名含 eval。

中文「评分/评测/基准」等：0 命中。✓
public/ 下不存在 docs/frontend-guide.md（practice 注入目标未 materialize 进 workspace）。✓
无 private/oracle/evaluator/calibration/practice 内容进入 public。✓
4. 结构完整性 — 通过
项	profile-update-command-boundary-v2	project-directory-resource-state-v2
candidate.yaml	存在，字段完整，kernel.profile: injection-calibration/v2，lifecycle_stage: candidate	同上
conditions.yaml	存在；baseline/oracle-practice/irrelevant-practice 均 declared、lorelum-retrieval unavailable；decision_rule 完整	同上
oracle.yaml	存在；semantic_oracle.command: bun run test + 4 条断言；practice_observation 职责完整；baseline_expected_result: {semantic: fail, practice_observation: not-observed}	同上
snapshot.json	存在；version/algorithm/snapshot_id/files(41)/resolved 完整；全量 41 文件 sha256 与磁盘一致（0 缺失 0 不匹配）；resolved.profile: injection-calibration/v2	同上（41/41 一致）
practices/metadata.yaml	delivery_template: project-convention/v1；两张卡 target_path: docs/frontend-guide.md；长度 297/292，relative diff 0.016835	project-convention/v1；docs/frontend-guide.md；长度 303/294，diff 0.029703
practices sha256（conditions.yaml 引用 vs 实际）	b3b1b80a… / 9fb5b762… 均一致	2fad7536… / 0e7a2318… 均一致


kernel 声明 profile: injection-calibration/v2 在 candidate.yaml 与 snapshot.json.resolved 两处确认。✓
结论汇总
类别	结果
1 语义测试	⚠️ 与预期不符：pristine starter 按设计 2/2、1/1 失败（占位）；reference 实现 2/2、1/1 通过 → 测试套件有效；candidate 2 仅 1 个测试
2 真实性审计	✅ 通过（2 个轻微发现：git-history 末 commit files 列表为空、package.json name 用候选 id）
3 泄露审计	✅ 通过（仅 bun.lock/方法名误报，无中文痕迹，无 frontend-guide.md）
4 结构完整性	✅ 通过（4 文件齐备、snapshot 41/41 哈希一致、profile/practices 声明正确）


只读承诺：未修改任何被跟踪文件、未提交、未创建/合并分支；按要求执行 bun install --frozen-lockfile 与测试后，两 candidate 的 public/starter/app 下仅生成 gitignored 运行产物（node_modules/、test-results/，已被 app 内 .gitignore 忽略，git status 无新增待提交项）。