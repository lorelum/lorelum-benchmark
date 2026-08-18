import { resolve } from "node:path";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");

async function run(command: string[], cwd: string): Promise<number> {
  const child = Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" });
  return await child.exited;
}

// v3 验收分层：公开测试只判定语义/回归（semantic），政策符合性由私有 judge 判定。
// 六路径探针字段退化为 semantic 同值，仅用于兼容 run-local 的解析契约。
const semanticExitCode = await run(["bun", "run", "test"], appRoot);
const semantic = semanticExitCode === 0 ? "pass" : "fail";
console.log(JSON.stringify({
  health: "evaluated",
  semantic,
  quality: semantic === "pass" ? "observed" : "not-observed",
  ast_probe: semantic,
  runtime_scope_resolve_probe: semantic,
  runtime_scope_reject_probe: semantic,
  runtime_reload_resolve_probe: semantic,
  runtime_reload_reject_probe: semantic,
  runtime_background_resolve_probe: semantic,
  runtime_background_reject_probe: semantic,
  practice_probe: semantic,
}));
process.exit(semanticExitCode === 0 ? 0 : 1);
