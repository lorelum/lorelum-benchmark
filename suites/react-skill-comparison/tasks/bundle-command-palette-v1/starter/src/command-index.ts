interface BenchmarkGlobal {
  __benchmarkModuleLoads?: string[];
}

const benchmarkGlobal = globalThis as typeof globalThis & BenchmarkGlobal;
benchmarkGlobal.__benchmarkModuleLoads ??= [];
benchmarkGlobal.__benchmarkModuleLoads.push("command-index");

export function createCommandIndex(query: string): string[] {
  return ["Open project", "Search issues", "Invite teammate"].filter((command) =>
    command.toLowerCase().includes(query.toLowerCase()),
  );
}
