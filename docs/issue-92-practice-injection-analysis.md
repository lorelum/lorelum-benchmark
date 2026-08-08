# #92 Practice 注入对照结果分析：为什么 Oracle 注入更好

> 内部诊断证据（脱敏）。分数与代码均来自真实运行记录（judge.sidecar / summary.json / workspace 源码），逐条可核对。
> 本文回答：条件到底是什么、oracle 为什么比 baseline 好、judge 为什么给这个分、具体是哪里的代码写得好。

## 标题结论（初步）

**在固定输入身份内，向 Agent 注入与任务相关的 Practice（oracle），使"代码分层质量"显著且一致地高于不注入（baseline）和注入无关 Practice（irrelevant）：三个候选的 oracle joint-pass（3/3、3/3、3/6）均严格高于各自两个对照，judge 分数同步更高（oracle ≈68–100，baseline ≈48–61）。** 这支持"给对 Practice 可能有帮助"（Oracle 注入环节）的方向性判断。但样本极小、登录页候选存在执行缺口（整体判"不确定"）、真实检索链路（条件 C）尚未实现——因此这只是方向性诊断证据，不能断言"精准注入有效"或任何产品效果。

## 1. 条件说明：baseline / oracle / irrelevant 到底是什么

| 条件 | 注入内容 | 登录页候选 | profile-update 候选 | project-directory 候选 |
| --- | --- | --- | --- | --- |
| baseline | **不注入**任何 Practice | — | — | — |
| oracle-practice | 注入**与任务直接相关**的 Practice | `login-page.frontend-layering`（前端分层：传输/领域/展示分离） | `profile-update.command-domain-boundary`（命令与领域边界：保存操作走领域层） | `project-directory.query-resource-state`（查询的资源状态建模） |
| irrelevant-practice | 注入**等长但无关**的 Practice（同格式、不同主题的对照） | `login-page.list-rendering`（列表渲染，与"登录表单分层"无关） | `profile-update.modal-focus`（模态框焦点，与"显示名保存"无关） | `project-directory.avatar-fallback`（头像兜底，与"项目目录搜索"无关） |

三条件只有注入内容不同：同一任务、同一固定输入身份（source_commit + snapshot_id + profile_input_hash）、同一模型/提示/预算。irrelevant 是**等长无关对照**——证明收益来自"Practice 相关"，而不是"多给一段文本就有用"。

## 2. 怎么得出：评分机制

- 每候选 × 每条件跑 3 遍（登录页 6 遍）：先跑**自动化测试**（语义硬门槛，本次全部通过），再让 LLM judge 按候选声明的 rubric 对**提交的代码**逐条打分（`points/max_points` + rationale）。
- `joint_pass` = 语义通过 **且** 质量探针 `observed`（结构化探针确认代码落实了 Practice 要求的分层结构）。judge 分数与质量探针是两个信号：judge 看代码结构，探针看可观测结构；本报告 joint_pass 以探针为准。

## 3. 逐候选：为什么 oracle 更好（跨重复分数 + 真实代码）

### 3.1 login-page-auth-flow-v2（oracle 100×3，但有噪音）

跨重复 judge 分数（6 遍；— = 执行失败）：

| 条件 | r1 | r2 | r3 | r4 | r5 | r6 | joint_pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 0 | 45 | 0 | 100(jp) | —(失败) | 0 | 1 |
| oracle-practice | 100(jp) | 100(jp) | —(失败) | 100(jp) | 0 | 0 | 3 |
| irrelevant-practice | 0 | 45 | 0 | 100(jp) | 100(jp) | 45 | 2 |

oracle 版本（judge 100）——组件只依赖领域操作，不碰 status/body：

```tsx
// LoginPage.tsx（oracle attempt-1）
import { login } from "./api/session";        // 只 import 领域操作
const result = await login(email, password);
if (result.ok) { setUser(result.displayName); } else { setError(result.message); }
```
```ts
// api/session.ts（oracle attempt-1）——边界负责传输与翻译
export type LoginResult = { ok: true; displayName: string } | { ok: false; message: string };
export async function login(email, password): Promise<LoginResult> {
  const response = await postSession({ email, password });
  if (response.status === 200) return { ok: true, displayName: response.body.user.display_name };
  return { ok: false, message: response.body.message };
}
```

baseline 版本（judge 0）——组件直接读原始响应：

```tsx
// LoginPage.tsx（baseline attempt-1）
import { postSession } from "./api/http";
const result = await postSession({ email, password });
if (result.status === 200) { setDisplayName(result.body.user.display_name); }  // 组件里读 status/body
else { setError(result.body.message); }
```

**噪音（诚实说明）**：oracle 也有 2 次 0 分、baseline/irrelevant 也偶有 100 分——不是"oracle 永远满分"，而是"oracle 让高质量分层出现概率更高"（3/6 vs 1/6、2/6）。这正是用 joint_pass 次数 + 严格规则、不用平均分的原因（见第 5 节）。且 2 遍执行失败 → 该单元整体判不确定。

### 3.2 profile-update-command-boundary-v2（oracle 三遍全过）

跨重复分数（3 遍）：

| 条件 | r1 | r2 | r3 | joint_pass |
| --- | --- | --- | --- | --- |
| baseline | 52 | 61(jp) | 50 | 1 |
| oracle-practice | 75(jp) | 68(jp) | 82(jp) | 3 |
| irrelevant-practice | 71 | —(未观测) | 66(jp) | 1 |

真实代码对比：

```tsx
// LoginPage.tsx（oracle attempt-1）——组件只消费领域结果
import { loadProfile, saveDisplayName } from "./services/profileBoundary";
const result = await saveDisplayName(displayName);
if (result.type === "conflict") { setError("名称已被使用"); }
```
```ts
// services/profileBoundary.ts（oracle attempt-1）——边界翻译 409 → conflict
export type SaveResult = { type: "ok"; displayName: string } | { type: "conflict" };
export async function saveDisplayName(displayName: string): Promise<SaveResult> {
  const res = await saveProfile(displayName);
  if (res.status === 409) return { type: "conflict" };
  return { type: "ok", displayName: res.body.display_name };
}
```

```tsx
// LoginPage.tsx（baseline attempt-1）——组件直接读 res.status / res.body
import { getProfile, saveProfile } from "./services/http";
useEffect(() => { getProfile().then((res) => setDisplayName(res.body.display_name)); }, []);
// handleSubmit 里：if (res.status === 200) setSuccess("资料已保存"); else setError("名称已被使用");
```

关键 criteria 差异（oracle vs baseline）：domain-delegation 20/20 vs 14/20（组件是否只处理领域结果）、boundary-translation 14/20 vs 4/20（是否把 409/失败翻译成领域形状）、raw-response-containment 10/10 vs 2/10（原始 body 是否流出边界）。**两边都丢分**：无加载态、无错误/重试 UI、重复提交保护不过测试——Practice 只提升了分层，没覆盖交互完整性。

### 3.3 project-directory-resource-state-v2（oracle 三遍全过，含补跑）

跨重复分数（3 遍；oracle r3 = 补跑替换，原为超时）：

| 条件 | r1 | r2 | r3 | joint_pass |
| --- | --- | --- | --- | --- |
| baseline | 52 | 53 | 48 | 0 |
| oracle-practice | 86(jp) | 81(jp) | 88(jp 补跑) | 3 |
| irrelevant-practice | 54 | —(未观测) | 56 | 0 |

真实代码对比：

```tsx
// LoginPage.tsx（oracle attempt-1）——state 只有领域状态
import { loadDirectory, type DirectoryState } from "./services/directory-api";
const [state, setState] = useState<DirectoryState | null>(null);
useEffect(() => { loadDirectory("").then(setState); }, []);
// 渲染：state?.kind === "ready" → state.projects.map(...)
```
```ts
// services/directory-api.ts（oracle attempt-1）——边界翻译 503/空
export type DirectoryState = { kind: "ready"; projects: Project[] } | { kind: "empty" } | { kind: "failed" };
export async function loadDirectory(query: string): Promise<DirectoryState> {
  const response = await fetchProjects(query);
  if (response.status === 503) return { kind: "failed" };
  if (response.body.length === 0) return { kind: "empty" };
  return { kind: "ready", projects: response.body };
}
```

```tsx
// LoginPage.tsx（baseline attempt-1）——组件读 status/body
import { fetchProjects } from "./services/http";
const result = await fetchProjects(q);
if (result.status === 200) { setProjects(result.body); } else { setProjects([]); setError(true); }
```

关键差异：transport-isolation 20/20 vs 5/20（组件是否碰 status/body）、boundary-translation 15/20 vs 3/20（是否把 503/空翻译成领域状态）、raw-response-containment 15/15 vs 5/15。oracle 丢分点：网络 rejection 没 catch、无加载指示/去抖（8/15）。

## 4. irrelevant 具体是什么，为什么它不帮忙

irrelevant 是**等长但主题无关**的 Practice（见第 1 节表）：给同一任务注入"模态框焦点/头像兜底/列表渲染"这类与手头任务无关的规则。以 profile-update 的 irrelevant 第 1 遍为例：judge 给了 71 分（不低），但**结构问题与 baseline 相同**——组件仍读 `res.status === 409`、`res.body.display_name`，boundary 没做领域翻译（7/20）、原始响应流出边界（2/10）。分数高只是因为交互细节做得好（correctness 30/30），**没有带来分层收益** → 质量探针 not-observed → 不构成 joint_pass。三个候选的 irrelevant joint_pass 都≈baseline（1/3、0/3、2/6），说明**收益来自"Practice 相关"，不是"多给一段文本"**。

## 5. 噪音与判定口径：为什么用 joint_pass 次数 + 严格规则

- 数据有噪音（见 3.1）：同条件内 0 与 100 并存；平均分会把"语义与质量"混成单分并被极端值扭曲（#92 禁止加权总分）。
- 因此每次 attempt 只判 joint_pass（语义过 **且** 质量 observed），再**数次数**：oracle 必须**严格高于** baseline 和 irrelevant 才算方向性信号；相等或更低只算诊断性；任一执行缺口 → 不确定。
- 三个候选 joint_pass：oracle 3/3、3/3、3/6 vs baseline 1/3、0/3、1/6 vs irrelevant 1/3、0/3、2/6 → 方向一致。

## 6. 边界与结论

- 样本极小（每候选 3 次）；登录页有执行缺口 → 整体不确定。
- 真实检索链路（条件 C）未实现：只能回答"给对 Practice 是否有用"，不能回答"精准注入是否有效"。
- judge 是软信号，任务完成由自动化测试决定（本次语义全过）；未做盲评、成本/时延统计、未创建正式 record。
- **标题结论见文首**：方向性一致支持"给对 Practice 有用"，需扩样 + 真实检索对照后才能升级为结论。

## 7. 附注

- 证据位置：`scratch/v2-full-run/`（v2 两候选，含 workspace 源码 + judge sidecar）、`scratch/v2-rerun-pdir/`（pdir 补跑）、`scratch/profile-diagnostics/login-v2-three-condition-retest-v2/`（登录页，含源码）；每条结论对应 `source_commit` / `snapshot_id` / `profile_input_hash`。
- #75 历史候选（非 kernel、旧 pilot）不可比，仅作背景。
- 脱敏：不包含 Practice 文本、私有 Practice 路径、工作区绝对路径；Practice 仅以 id（已在脱敏 trace 中）指代。