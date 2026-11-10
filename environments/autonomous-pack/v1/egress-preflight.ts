import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Synthetic local HTTPS only. This is not a provider egress or model test.
const [agentImage, proxyImage] = process.argv.slice(2);
if (process.argv.length !== 4 || ![agentImage, proxyImage].every(x => /^sha256:[a-f0-9]{64}$/.test(x ?? ""))) {
  throw new Error("Usage: bun run environments/autonomous-pack/v1/egress-preflight.ts <agent-image-id> <proxy-image-id>");
}

// Do not pass the caller's model credentials to child processes or containers.
// Docker still needs its connection configuration; no credential values are logged.
const allowedEnv = /^(PATH|SYSTEMROOT|COMSPEC|PATHEXT|HOME|USERPROFILE|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|TMP|TEMP|TMPDIR|XDG_RUNTIME_DIR)$/i;
const env = Object.fromEntries(Object.keys(process.env).filter(k => allowedEnv.test(k)).map(k => [k, process.env[k]]));
const suffix = randomUUID();
const containers: string[] = [];
const networks: string[] = [];
type AttachedProxy = {
  stdin: { write(data: string): unknown; end(): unknown };
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill(): void;
};
let attached: AttachedProxy | undefined;
let root: string | undefined;

async function run(command: string[], timeout = 30_000): Promise<{ code: number; out: string }> {
  const child = Bun.spawn(command, { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => child.kill(), timeout);
  try {
    const [code, out] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, out: out.trim() };
  } finally { clearTimeout(timer); }
}
async function docker(args: string[]): Promise<string> {
  const result = await run(["docker", ...args]);
  if (result.code !== 0) throw new Error(`Docker ${args[0]} failed (exit ${result.code}); diagnostics suppressed`);
  return result.out;
}
async function createContainer(args: string[]): Promise<string> {
  const id = await docker(["create", ...args]);
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid created container ID");
  containers.push(id);
  return id;
}
async function createNetwork(args: string[]): Promise<string> {
  const id = await docker(["network", "create", ...args]);
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid created network ID");
  networks.push(id);
  return id;
}
async function awaitReady(child: AttachedProxy): Promise<{ output: Promise<string> }> {
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const timer = setTimeout(() => child.kill(), 15_000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("Proxy exited before readiness");
      text += decoder.decode(value, { stream: true });
      if (text.includes("model-proxy-ready:8080")) break;
      if (text.length > 16_384) throw new Error("Unexpected proxy output before readiness");
    }
  } catch (error) {
    reader.releaseLock();
    throw error;
  } finally { clearTimeout(timer); }
  // A disturbed stream cannot be wrapped in a new Response; keep the reader.
  const output = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return text + decoder.decode();
        text += decoder.decode(value, { stream: true });
        if (text.length > 1_048_576) { child.kill(); throw new Error("Proxy output limit exceeded"); }
      }
    } finally { reader.releaseLock(); }
  })();
  void new Response(child.stderr).arrayBuffer().catch(() => {});
  return { output };
}

const upstreamProgram = `
const https = require('node:https'), fs = require('node:fs');
let count=0;
https.createServer({key:fs.readFileSync('/cert/key.pem'),cert:fs.readFileSync('/cert/cert.pem')}, (req,res) => {
  if (req.method === 'GET' && req.url === '/counts') { res.end(String(count)); return; }
  if (req.method !== 'POST' || req.url !== '/fixture/chat/completions' || !req.headers.authorization?.startsWith('Bearer ')) { res.writeHead(400); res.end(); return; }
  count++;
  let data=''; req.on('data', b => { data += b; if (data.length > 65536) req.destroy(); });
  req.on('end', () => { let body; try { body=JSON.parse(data); } catch { res.writeHead(400); res.end(); return; }
    if (body.probe === 'redirect') { res.writeHead(307, {location:'https://upstream:8443/trap'}); res.end(); return; }
    res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify({synthetic:true,path:req.url,usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}));
  });
}).listen(8443, '0.0.0.0');`;

const agentProgram = `
const net=require('node:net'), fs=require('node:fs');
const p=JSON.parse(process.argv[1]);
const connect=(host,port)=>new Promise(resolve=>{const s=net.connect({host,port}); s.setTimeout(2500); s.on('connect',()=>{s.destroy();resolve(true)}); s.on('error',()=>resolve(false)); s.on('timeout',()=>{s.destroy();resolve(false)});});
async function request(path, method, body) { const r=await fetch('http://proxy:8080'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(7000)}); return {status:r.status,text:await r.text()}; }
let stage='agent-identity';
(async()=>{
  if (process.getuid() !== 65532) throw Error();
  stage='host-sentinel';
  if (process.env.LORELUM_PREFLIGHT_SENTINEL || fs.existsSync(p.privatePath)) throw Error();
  stage='direct-upstream';
  if (await connect(p.upstream,8443)) throw Error();
  stage='direct-external';
  if (await connect('1.1.1.1',443)) throw Error();
  stage='host-gateway';
  if (p.gateway && await connect(p.gateway,p.hostPort)) throw Error();
  stage='proxy-model-constraint';
  if ((await request('/v1/chat/completions','POST',{model:'wrong'})).status !== 403) throw Error();
  stage='proxy-query-constraint';
  if ((await request('/v1/chat/completions?target=other','POST',{model:'synthetic'})).status !== 404) throw Error();
  stage='proxy-path-constraint';
  if ((await request('/other','POST',{model:'synthetic'})).status !== 404) throw Error();
  stage='proxy-method-constraint';
  if ((await request('/v1/chat/completions','GET')).status !== 404) throw Error();
  stage='local-https-forwarding';
  const ok=await request('/v1/chat/completions','POST',{model:'synthetic'});
  const body=JSON.parse(ok.text); if (ok.status !== 200 || body.synthetic !== true || body.path !== '/fixture/chat/completions') throw Error();
  stage='proxy-redirect-constraint';
  if ((await request('/v1/chat/completions','POST',{model:'synthetic',probe:'redirect'})).status !== 502) throw Error();
  stage='proxy-request-budget';
  if ((await request('/v1/chat/completions','POST',{model:'synthetic'})).status !== 429) throw Error();
  console.log('synthetic-egress-checks-passed');
})().catch(()=>{console.log('failed:'+stage);process.exit(1)});`;

const host = createServer(socket => socket.destroy());
let cleanupFailed = false;
try {
  for (const image of [agentImage, proxyImage]) {
    if (await docker(["image", "inspect", "--format", "{{.Id}}", image]) !== image) throw new Error("Image ID mismatch");
  }
  root = await mkdtemp(join(tmpdir(), "lorelum-egress-"));
  const cert = join(root, "cert.pem"), key = join(root, "key.pem");
  const generated = await run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=upstream", "-addext", "subjectAltName=DNS:upstream"]);
  if (generated.code !== 0) throw new Error("Synthetic TLS certificate generation failed");
  // The key is synthetic and only mounted in the upstream fixture. The proxy needs only the CA certificate.
  await chmod(key, 0o644);
  await chmod(cert, 0o644);
  const sentinel = randomBytes(32).toString("hex");
  env.LORELUM_PREFLIGHT_SENTINEL = sentinel;
  const privatePath = join(root, "host-only-sentinel");
  await writeFile(privatePath, sentinel, { mode: 0o600 });
  const listening = Promise.withResolvers<void>();
  host.once("error", listening.reject);
  host.listen(0, "0.0.0.0", listening.resolve);
  await listening.promise;
  const address = host.address();
  if (!address || typeof address === "string") throw new Error("Host listener address unavailable");
  const hostPort = address.port;
  const internal = await createNetwork(["--internal", `lorelum-egress-internal-${suffix}`]);
  const upstreamNet = await createNetwork([`lorelum-egress-upstream-${suffix}`]);
  const info = JSON.parse(await docker(["network", "inspect", internal]));
  const gateway = info[0]?.IPAM?.Config?.find((x: { Gateway?: string }) => x.Gateway)?.Gateway ?? null;
  const hardened = ["--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65532:65532", "--pull", "never"];
  const fixture = await createContainer([...hardened, "--network", upstreamNet, "--network-alias", "upstream", "--mount", `type=bind,src=${cert},dst=/cert/cert.pem,readonly`, "--mount", `type=bind,src=${key},dst=/cert/key.pem,readonly`, "--entrypoint", "node", agentImage, "-e", upstreamProgram]);
  await docker(["start", fixture]);
  const ready = await run(["docker", "exec", fixture, "node", "-e", "const net=require('node:net');let n=0;function go(){const s=net.connect(8443,'127.0.0.1');s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>{if(++n===30)process.exit(1);setTimeout(go,200)})}go()"]);
  if (ready.code !== 0) throw new Error("Local HTTPS fixture failed to start");
  const inspect = JSON.parse(await docker(["inspect", fixture]));
  const upstreamIp = inspect[0]?.NetworkSettings?.Networks?.[Object.keys(inspect[0].NetworkSettings.Networks)[0]]?.IPAddress;
  if (!upstreamIp) throw new Error("Local upstream address unavailable");
  const proxy = await createContainer([...hardened, "-i", "--network", internal, "--network-alias", "proxy", "--mount", `type=bind,src=${cert},dst=/cert/ca.pem,readonly`, "--env", "NODE_EXTRA_CA_CERTS=/cert/ca.pem", proxyImage]);
  await docker(["network", "connect", upstreamNet, proxy]);
  attached = Bun.spawn(["docker", "start", "-a", "-i", proxy], { env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  attached.stdin.write(JSON.stringify({ baseUrl: "https://upstream:8443/fixture", apiKey: randomBytes(32).toString("hex"), model: "synthetic", port: 8080, hostname: "0.0.0.0", maxRequests: 2 }));
  attached.stdin.end();
  const { output } = await awaitReady(attached);
  const agent = await createContainer([...hardened, "--network", internal, "--entrypoint", "node", agentImage, "-e", agentProgram, JSON.stringify({ upstream: upstreamIp, gateway, hostPort, privatePath })]);
  const result = await run(["docker", "start", "-a", agent], 45_000);
  if (result.code !== 0 || result.out !== "synthetic-egress-checks-passed") {
    const stage = /^failed:([a-z-]+)$/.exec(result.out)?.[1] ?? "agent-start-or-output";
    throw new Error(`Synthetic egress check failed at ${stage}; no isolation claim established`);
  }
  const count = await run(["docker", "exec", fixture, "node", "-e", "require('node:https').get('https://127.0.0.1:8443/counts',{rejectUnauthorized:false},r=>{let s='';r.on('data',x=>s+=x);r.on('end',()=>console.log(s))}).on('error',()=>process.exit(1))"]);
  if (count.code !== 0 || count.out !== "2") throw new Error("Synthetic provider request budget was not enforced");
  await docker(["stop", "--time", "10", proxy]);
  if (await attached.exited !== 0) throw new Error("Proxy did not stop cleanly");
  const lines = (await output).split("\n");
  const terminal = lines.filter(line => line.startsWith("model-proxy-stopped:"));
  if (terminal.length !== 1) throw new Error("Proxy terminal usage marker missing");
  const snapshot = JSON.parse(terminal[0].slice("model-proxy-stopped:".length));
  if (snapshot.complete !== false || snapshot.totals !== null || snapshot.records?.length !== 2 || snapshot.records[0]?.status !== "complete" || snapshot.records[1]?.status !== "error") throw new Error("Proxy terminal usage was incomplete or inconsistent");
  console.log(JSON.stringify({
    result: "synthetic-checks-passed",
    coverage: ["non-root agent", "agent cannot connect to local upstream IP or 1.1.1.1:443 during this probe", "host-only synthetic sentinel absent from tested agent environment and path", "proxy rejects wrong model, path, query and method", "proxy reaches local HTTPS fixture, does not follow redirects, and enforces the request budget", ...(gateway ? ["agent cannot connect to temporary host listener via internal gateway"] : [])],
    gaps: ["Synthetic HTTPS fixture and custom CA are not real provider egress or a model request", "No assertion that arbitrary host credentials or every agent-readable path are absent", "TCP failures alone do not establish universal outbound isolation", "Docker DNS forwarding and host networking outside the tested gateway were not verified", ...(!gateway ? ["Internal network gateway unavailable; host-listener boundary not checked"] : []), "No assertion about other ports, protocols, IPv6, networks or future configuration"],
  }));
} finally {
  attached?.kill();
  for (const id of containers.reverse()) if ((await run(["docker", "rm", "-f", id])).code !== 0) cleanupFailed = true;
  for (const id of networks.reverse()) if ((await run(["docker", "network", "rm", id])).code !== 0) cleanupFailed = true;
  if (host.listening) {
    const closed = Promise.withResolvers<void>();
    host.close(() => closed.resolve());
    await closed.promise;
  }
  if (root) await rm(root, { recursive: true, force: true });
  if (cleanupFailed) throw new Error("Failed to remove one or more preflight-owned Docker resources");
}
