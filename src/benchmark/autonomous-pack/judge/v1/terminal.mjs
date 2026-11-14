import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import { PlanningSession, ControlledExecutionSession, discoverWorkspace, closeWorkspaceReview, verificationIdentity } from "@lorelum/judge-workflow";
import { createBubblewrapSandbox } from "@lorelum/runtime-bubblewrap";
import { identityOf } from "@lorelum/judge-protocol";
import { createOpenAiCompatibleModel, describeEndpoint } from "@lorelum/provider-openai-compatible";

const render = value => JSON.stringify(value, null, 2);
const decision = answer => answer.trim() === "yes";

/** Recompute the public protocol identity over the stopped candidate's bytes and modes. */
async function candidateIdentity(root) {
  if (await realpath(root) !== root) throw new Error("Candidate root is not canonical");
  const rootStat = await lstat(root), files = [];
  async function visit(directory, prefix = "") {
    for (const name of (await readdir(directory)).sort()) {
      const path = prefix ? `${prefix}/${name}` : name, absolute = join(directory, name), info = await lstat(absolute);
      if (name.toLowerCase() === ".git" || name.includes("\\") || info.isSymbolicLink() || info.dev !== rootStat.dev) throw new Error("Invalid candidate entry");
      if (info.isDirectory()) await visit(absolute, path);
      else if (info.isFile() && info.nlink === 1) {
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(absolute)) hash.update(chunk);
        const after = await lstat(absolute);
        if (after.ino !== info.ino || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.nlink !== 1 || !after.isFile()) throw new Error("Candidate changed during identification");
        files.push({ path, identity: `sha256:${hash.digest("hex")}`, mode: info.mode & 0o777 });
      } else throw new Error("Invalid candidate entry");
    }
  }
  if (!rootStat.isDirectory()) throw new Error("Invalid candidate root");
  await visit(root);
  const result = identityOf("workflow-frozen-candidate/v1", files);
  if (!result.ok) throw new Error("Cannot identify candidate");
  return result.identity;
}
const fail = result => { if (!result.ok) throw new Error(render(result.error)); return result.value; };

/** Run one real, in-process Judge session. The caller owns the candidate copy. */
export async function runTerminalCase(config) {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("Interactive Judge acceptance requires a terminal; scripted decisions are not human acceptance");
  const rl = createInterface({ input: stdin, output: stdout });
  const controller = new AbortController();
  let execution, workspace, current, lastResult;
  const interrupt = () => { controller.abort(); execution?.revoke(); };
  process.once("SIGINT", interrupt);
  rl.on("SIGINT", interrupt);
  const ask = prompt => rl.question(prompt, { signal: controller.signal });
  const show = (label, value) => stdout.write(`\n${label}\n${render(value)}\n`);
  const decisions = [], plans = [], modelUsage = [], actions = [];
  const finish = value => ({ ...value, decisions, plans, modelUsage, actions });
  try {
    const taskText = await readFile(config.taskFile, "utf8");
    stdout.write(`\n任务（固定 benchmark 题面）：\n${taskText}\n`);
    const note = config.requestNote ?? "";
    const text = note.trim() ? `${taskText}\n\n用户补充：${note}` : taskText;
    const disclosure = { endpoint: config.endpoint, model: config.model, task: text, sources: config.sources };
    show("以下内容将发送给所选模型；此决定不确认计划或授权执行", disclosure);
    const disclosed = decision(await ask("允许规划资料披露？输入 yes： "));
    decisions.push({ stage: "planning-disclosure", approved: disclosed });
    if (!disclosed) return finish({ status: "declined" });
    const transport = createOpenAiCompatibleModel({ endpoint: config.endpoint, apiKey: process.env.BENCHMARK_JUDGE_API_KEY, timeoutMs: config.modelTimeoutMs });
    let observationsSeen = 0, approvedPaths;
    const model = { async generate(request) {
      let actionPrompt = false, actionInput;
      if (request.messages.length === 1) {
        try {
          const input = JSON.parse(request.messages[0].content);
          actionPrompt = Array.isArray(input.observations);
          if (actionPrompt) actionInput = input;
          if (actionPrompt && input.observations.length > observationsSeen) {
            for (const observation of input.observations.slice(observationsSeen)) show("已观察到的动作结果", observation);
            observationsSeen = input.observations.length;
          }
        } catch { /* Review messages are not execution-action prompts. */ }
      }
      const messages = actionPrompt && approvedPaths
        ? [{ ...request.messages[0], content: JSON.stringify({ ...actionInput, authorizedReadPaths: approvedPaths.read, authorizedWritePaths: approvedPaths.write }) }]
        : request.messages;
      const response = await transport.generate({ ...request, messages, config: { model: config.model } });
      modelUsage.push(response.metadata?.usage ?? null);
      if (actionPrompt) {
        try {
          const action = response.kind === "structured" ? response.value : JSON.parse(response.content);
          actions.push(action);
          show("模型提出的动作", action);
        } catch { /* Judge reports malformed action responses itself. */ }
      }
      return response;
    } };
    const task = { schema: "lorelum.judge.task-contract/v1", id: config.taskId, taskClass: "code", text };
    const sources = [{ id: "request", kind: "user", locator: "benchmark:request", version: "1", content: text, status: "available" }, ...config.sources];
    const plan = new PlanningSession(`benchmark-${randomUUID()}`, { task, sources });
    const disclosureIdentity = plan.grantModelDisclosure(model);
    let instructions;
    for (;;) {
      current = fail(await plan.generate({ model, runId: randomUUID(), signal: controller.signal, disclosureIdentity, ...(instructions ? { instructions } : {}) }));
      plans.push(current);
      show("Judge 计划：验收条件若为模型建议，不代表用户要求", current);
      let choice;
      do { choice = (await ask("输入 confirm 确认当前完整计划，revise 调整，或 reject 拒绝： ")).trim(); } while (!["confirm", "revise", "reject"].includes(choice));
      if (choice === "reject") { decisions.push({ stage: "plan", approved: false, identity: current.identity, revision: current.revision }); return finish({ status: "declined", plan: current }); }
      if (choice === "revise") { instructions = await ask("输入调整意见： "); decisions.push({ stage: "plan-revision", identity: current.identity, revision: current.revision, instructions }); continue; }
      fail(plan.confirm(current.identity, current.revision));
      decisions.push({ stage: "plan", approved: true, identity: current.identity, revision: current.revision });
      break;
    }
    workspace = await discoverWorkspace(config.workspace, [], controller.signal);
    const additional = (await ask("额外授权读写的 src/ 文件，逗号分隔；留空表示仅使用默认文件： ")).split(",").map(item => item.trim()).filter(Boolean);
    if (additional.some(path => !/^src\/[A-Za-z0-9_.\/-]+$/.test(path) || path.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git"))) throw new Error("Additional paths must be normalized files under src/");
    const readPaths = [...new Set([...config.readPaths, ...additional])], writePaths = [...new Set([...config.writePaths, ...additional])];
    const commands = config.commands;
    show("可授权的命令（命令可读取整个私有副本）", commands);
    const checks = [];
    for (const check of current.plan.checks) {
      show("为计划中的检查选择实际命令；不匹配时应取消并修改计划", check);
      const selected = await ask(`命令编号 0–${commands.length - 1}，或输入 reject： `);
      if (selected.trim() === "reject") { decisions.push({ stage: "checks", approved: false }); return finish({ status: "declined", plan: current }); }
      if (!/^(0|[1-9][0-9]*)$/.test(selected.trim()) || Number(selected) >= commands.length) throw new Error("Invalid check command selection");
      checks.push({ id: check.id, version: "1", environmentIdentity: config.environmentIdentity, ...commands[Number(selected)], readPaths: ["."], timeoutMs: config.commandTimeMs, maxOutputBytes: config.checkOutputBytes });
    }
    const evidence = readPaths.map((_, index) => ({ evidenceId: `candidate-${index + 1}`, role: "primary" }));
    for (let index = 0; index < checks.length; index++) evidence.push({ evidenceId: `check-${index + 1}`, role: "primary" });
    const definition = {
      schema: "lorelum.judge.measurement-definition/v2", id: "benchmark-judge-self-review",
      criteria: [{ schema: "lorelum.judge.criterion/v1", id: "implementation", kind: "contract", description: "Assess whether the disclosed candidate and available check evidence support the confirmed task. This is advisory and is not the independent benchmark verifier.", mandatory: true, source: { origin: "contract", ref: "benchmark-task" }, anchors: [{ verdict: "met", description: "The evidence supports the task" }, { verdict: "unmet", description: "The evidence contradicts the task" }], evidence }],
      metadata: [{ criterionId: "implementation", role: "decisive", covers: [], appliesTo: ["code"] }],
    };
    const verification = { checks, review: { input: { definition, method: { kind: "llm", provider: { protocol: "openai.chat-completions/v1", adapterVersion: "1" }, endpointIdentity: describeEndpoint(config.endpoint).identity, model: { provider: config.provider, name: config.model } } }, ports: { model } } };
    const permission = {
      planIdentity: current.identity, planRevision: current.revision, workspaceIdentity: workspace.identity,
      readPaths, commandReadPaths: ["."], writePaths, writablePaths: config.writablePaths,
      commands, disclosures: ["plan", "file-content", "command-output", "review"], modelRecipient: config.model,
      limits: { totalTimeMs: config.totalTimeMs, commandTimeMs: config.commandTimeMs, modelCalls: config.modelCalls, actions: config.actions, commands: config.commandLimit, outputBytes: config.outputBytes },
      expiresAt: Date.now() + config.totalTimeMs, isolation: "bubblewrap-no-network", verificationIdentity: verificationIdentity(verification),
    };
    execution = new ControlledExecutionSession(plan, workspace);
    const proposal = execution.propose(permission, verification);
    show("独立执行权限提案（含文件、命令、披露、预算、检查和模型接收方）", proposal);
    const executionDisclosure = decision(await ask("允许将列出的计划、文件内容、命令输出和评审资料发送给该模型？输入 yes： "));
    decisions.push({ stage: "execution-disclosure", approved: executionDisclosure, identity: proposal.identity });
    if (!executionDisclosure) return finish({ status: "declined", plan: current });
    const authorized = decision(await ask("单独授权列出的文件和命令操作？输入 yes： "));
    decisions.push({ stage: "execution-permission", approved: authorized, identity: proposal.identity });
    if (!authorized) return finish({ status: "declined", plan: current });
    approvedPaths = { read: readPaths, write: writePaths };
    execution.authorize(proposal.identity, model, `interactive:${randomUUID()}`);
    stdout.write("\n开始受控执行；Ctrl+C 撤销并中止。\n");
    const result = await execution.implement({ model, sandbox: createBubblewrapSandbox(), runId: randomUUID(), signal: controller.signal });
    lastResult = result;
    show("Judge 执行结果、差异与检查（completed 不等于功能通过）", result);
    if (result.status !== "completed") return finish({ status: result.status, plan: current, result });
    controller.signal.throwIfAborted();
    const verifiedCandidateIdentity = await candidateIdentity(result.workspaceRoot);
    controller.signal.throwIfAborted();
    if (verifiedCandidateIdentity !== result.evidence?.candidateIdentity) return finish({ status: "failed", plan: current, result, error: "Stopped candidate does not match the Judge-tested identity" });
    return finish({ status: result.status, plan: current, result, verifiedCandidateIdentity });
  } catch (error) {
    return finish({ status: controller.signal.aborted ? "cancelled" : "failed", ...(current ? { plan: current } : {}), ...(lastResult ? { result: lastResult } : {}), error: error instanceof Error ? error.message : String(error) });
  } finally {
    execution?.revoke();
    if (workspace) await closeWorkspaceReview(workspace);
    process.removeListener("SIGINT", interrupt);
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(await readFile(process.argv[2], "utf8"));
  const result = await runTerminalCase(config);
  await writeFile(config.resultFile, `${render(result)}\n`, { flag: "wx", mode: 0o600 });
}
