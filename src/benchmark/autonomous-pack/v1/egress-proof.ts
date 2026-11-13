// Inspection evidence is meaningful only when obtained directly from the trusted
// Docker daemon for the run being evaluated, before untrusted code is released.
// It is not an authorization token and cannot establish universal egress isolation.
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as ObjectValue : null;
const strings = (v: unknown): string[] | null => Array.isArray(v) && v.every(x => typeof x === "string") ? v : null;
const one = (v: unknown): ObjectValue | null => Array.isArray(v) && v.length === 1 ? object(v[0]) : null;

export type EgressInspectionInput = {
  agent: unknown; proxy: unknown; internalNetwork: unknown; upstreamNetwork: unknown;
  agentImage: string; proxyImage: string; agentId: string; proxyId: string;
  internalId: string; upstreamId: string;
  // Additional explicitly identified upstream members, e.g. a local fixture.
  upstreamPeerIds?: readonly string[];
  // Exact daemon-observed bind sources, destinations and modes for this run.
  agentMounts: ReadonlyArray<{ source: string; destination: string; rw: boolean }>;
  proxyMounts: ReadonlyArray<{ source: string; destination: string; rw: boolean }>;
};
export type EgressInspectionResult = {
  status: "observed" | "indeterminate";
  failures: string[];
  limitations: readonly string[];
};
const limitations = [
  "Docker daemon, host, images and inspection channel must be trusted; snapshots are not a tamper-proof attestation.",
  "Configuration snapshots do not prove firewall behavior, DNS isolation, all protocols, future state or a real provider connection.",
  "Image contents, bind-mount contents, ambient host credentials and successful provider responses are not inspected; a provider can echo the credential.",
  "Proxy has an unrestricted upstream network; application-level endpoint restrictions are not a network egress firewall.",
  "Observed topology is conditional on these trust assumptions; it is not proof of universal network isolation or cleanup.",
] as const;

/** Validate raw Docker inspect JSON against the exact identities and mounts of a
 * single run. Call again immediately before releasing the agent; never reuse a
 * preflight snapshot as proof for a different execution. */
export function inspectEgressTopology(input: EgressInspectionInput): EgressInspectionResult {
  const failures: string[] = [];
  const fail = (message: string) => { failures.push(message); };
  const agent = one(input.agent), proxy = one(input.proxy), internal = one(input.internalNetwork), upstream = one(input.upstreamNetwork);
  const peers = input.upstreamPeerIds ?? [];
  const ids = [input.agentId, input.proxyId, input.internalId, input.upstreamId, ...peers];
  if (ids.some(id => !/^[a-f0-9]{64}$/.test(id)) || new Set(ids).size !== ids.length || !/^sha256:[a-f0-9]{64}$/.test(input.agentImage) || !/^sha256:[a-f0-9]{64}$/.test(input.proxyImage)) fail("invalid resource or image identity");
  if (!agent || !proxy || !internal || !upstream) return { status: "indeterminate", failures: [...failures, "missing or malformed inspect output"], limitations };
  function network(n: ObjectValue, id: string, internalExpected: boolean, expectedMembers: string[]) {
    const members = object(n.Containers);
    if (n.Id !== id || typeof n.Name !== "string" || !n.Name || n.Internal !== internalExpected || n.Driver !== "bridge" || !members || Object.keys(members).sort().join(",") !== [...expectedMembers].sort().join(",")) fail(`network ${internalExpected ? "internal" : "upstream"} configuration or membership mismatch`);
  }
  function container(c: ObjectValue, id: string, image: string, networkIds: string[], mounts: EgressInspectionInput["agentMounts"], role: string) {
    const config = object(c.Config), host = object(c.HostConfig), settings = object(c.NetworkSettings), networks = object(settings?.Networks);
    const configuredIds = networks && Object.values(networks).map(x => object(x)?.NetworkID);
    const caps = strings(host?.CapDrop), security = strings(host?.SecurityOpt), environment = strings(config?.Env);
    if (c.Id !== id || c.Image !== image || !config || !host || !networks || !configuredIds || configuredIds.some(x => typeof x !== "string") || configuredIds.sort().join(",") !== [...networkIds].sort().join(",")) fail(`${role} identity or network mismatch`);
    if (host?.Privileged !== false || host?.ReadonlyRootfs !== true || !caps?.includes("ALL") || (host?.CapAdd !== null && (!Array.isArray(host?.CapAdd) || host.CapAdd.length !== 0)) || !security?.some(x => x === "no-new-privileges" || x === "no-new-privileges=true") || security.some(x => /^(?:seccomp|apparmor)=unconfined$|^label=disable$|^systempaths=unconfined$/i.test(x)) || config?.User !== "65532:65532" || (host?.NetworkMode !== input.internalId && host?.NetworkMode !== internal.Name) || host?.PidMode !== "" || host?.IpcMode !== "private" || !Array.isArray(host?.Devices) || host.Devices.length !== 0) fail(`${role} hardening mismatch`);
    if (!environment || environment.some(x => /^(?:.*(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL).*|LORELUM_PREFLIGHT_SENTINEL)=/i.test(x))) fail(`${role} environment contains a credential-like name or is unavailable`);
    if (!Array.isArray(c.Mounts)) { fail(`${role} mounts unavailable`); return; }
    const actual = c.Mounts.map(object);
    if (actual.some(m => !m || m.Type !== "bind" || typeof m.Source !== "string" || typeof m.Destination !== "string" || typeof m.RW !== "boolean") || actual.length !== mounts.length || mounts.some(expected => actual.filter(m => m?.Source === expected.source && m.Destination === expected.destination && m.RW === expected.rw).length !== 1)) fail(`${role} mount mismatch`);
  }
  network(internal, input.internalId, true, [input.agentId, input.proxyId]);
  network(upstream, input.upstreamId, false, [input.proxyId, ...peers]);
  container(agent, input.agentId, input.agentImage, [input.internalId], input.agentMounts, "agent");
  container(proxy, input.proxyId, input.proxyImage, [input.internalId, input.upstreamId], input.proxyMounts, "proxy");
  return { status: failures.length ? "indeterminate" : "observed", failures, limitations };
}
