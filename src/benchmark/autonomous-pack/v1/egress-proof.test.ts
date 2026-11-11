import { expect, test } from "bun:test";
import { inspectEgressTopology } from "./egress-proof";

const agentId = "a".repeat(64), proxyId = "b".repeat(64), internalId = "c".repeat(64), upstreamId = "d".repeat(64);
const agentImage = `sha256:${"e".repeat(64)}`, proxyImage = `sha256:${"f".repeat(64)}`;
function fixture() {
  const host = { Privileged: false, ReadonlyRootfs: true, CapDrop: ["ALL"], CapAdd: null as string[] | null, SecurityOpt: ["no-new-privileges"], NetworkMode: internalId, PidMode: "", IpcMode: "private", Devices: [] };
  const config = { User: "65532:65532", Env: ["PATH=/usr/bin"] };
  return {
    agentId, proxyId, internalId, upstreamId, agentImage, proxyImage,
    agent: [{ Id: agentId, Image: agentImage, HostConfig: structuredClone(host), Config: structuredClone(config), Mounts: [] as Array<{ Type: string; Source: string; Destination: string; RW: boolean }>, NetworkSettings: { Networks: { internal: { NetworkID: internalId } } } }],
    proxy: [{ Id: proxyId, Image: proxyImage, HostConfig: structuredClone(host), Config: structuredClone(config), Mounts: [], NetworkSettings: { Networks: { internal: { NetworkID: internalId }, upstream: { NetworkID: upstreamId } } } }],
    internalNetwork: [{ Id: internalId, Name: "internal", Internal: true, Driver: "bridge", Containers: { [agentId]: {}, [proxyId]: {} } as Record<string, object> }],
    upstreamNetwork: [{ Id: upstreamId, Name: "upstream", Internal: false, Driver: "bridge", Containers: { [proxyId]: {} } as Record<string, object> }],
    agentMounts: [], proxyMounts: [],
  };
}

test("observes matching container and network topology", () => {
  const result = inspectEgressTopology(fixture());
  expect(result.status).toBe("observed");
});

test("missing and malformed inspections are indeterminate", () => {
  const input = fixture(); input.agent = [];
  expect(inspectEgressTopology(input).status).toBe("indeterminate");
});

test("unexpected network member, bind mount, credential environment and capabilities fail closed", () => {
  const input = fixture();
  const internal = input.internalNetwork[0]; internal.Containers["1".repeat(64)] = {};
  const agent = input.agent[0];
  agent.Mounts.push({ Type: "bind", Source: "/private", Destination: "/private", RW: true });
  agent.Config.Env.push("MODEL_API_KEY=synthetic");
  agent.HostConfig.CapAdd = ["NET_ADMIN"];
  const result = inspectEgressTopology(input);
  expect(result.status).toBe("indeterminate");
  expect(result.failures).toContain("network internal configuration or membership mismatch");
  expect(result.failures).toContain("agent mount mismatch");
  expect(result.failures).toContain("agent environment contains a credential-like name or is unavailable");
  expect(result.failures).toContain("agent hardening mismatch");
});

test("unconfined seccomp, shared PID namespaces and missing device data are indeterminate", () => {
  const unconfined = fixture();
  unconfined.agent[0].HostConfig.SecurityOpt.push("seccomp=unconfined");
  expect(inspectEgressTopology(unconfined).status).toBe("indeterminate");
  const shared = fixture();
  shared.proxy[0].HostConfig.PidMode = "container:other";
  expect(inspectEgressTopology(shared).status).toBe("indeterminate");
  const incomplete = fixture();
  const host = incomplete.agent[0].HostConfig as unknown as Record<string, unknown>;
  delete host.Devices;
  expect(inspectEgressTopology(incomplete).status).toBe("indeterminate");
});

test("explicit local fixture membership is checked against actual network inspection", () => {
  const input = { ...fixture(), upstreamPeerIds: ["1".repeat(64)] }, fixtureId = "1".repeat(64);
  expect(inspectEgressTopology(input).status).toBe("indeterminate");
  input.upstreamNetwork[0].Containers[fixtureId] = {};
  expect(inspectEgressTopology(input).status).toBe("observed");
});
