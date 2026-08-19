import { resolve } from "node:path";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");

// 采纳层验收：公开语义测试通过作为可观察证据；政策符合性（窗口起点 + 前台在途语义）
// 由 skill-trigger-source-authority/v2 judge 语义验收，不在此引入额外结构探针。
const semanticExitCode = await Bun.spawn([process.execPath, "run", "test"], { cwd: appRoot, stdout: "inherit", stderr: "inherit" }).exited;
const semantic = semanticExitCode === 0 ? "pass" : "fail";
console.log(JSON.stringify({
  semantic,
  practice_observation: semantic === "pass" ? "observed" : "not-observed",
}));
process.exit(semanticExitCode === 0 ? 0 : 1);
