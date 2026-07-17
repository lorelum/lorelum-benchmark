const moduleLoads = (globalThis as typeof globalThis & {
  __benchmarkModuleLoads?: string[];
}).__benchmarkModuleLoads;

moduleLoads?.push("advanced-panel");

export interface AdvancedPanel {
  render(): string;
}

export function createAdvancedPanel(): AdvancedPanel {
  return {
    render: () => "Advanced settings",
  };
}
