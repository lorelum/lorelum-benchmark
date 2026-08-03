# calibration-runtime-isolated-port Specification

## Purpose
TBD - created by archiving change calibration-runtime-isolated-port. Update Purpose after archive.
## Requirements
### Requirement: 每次调用独占的 calibration runtime 端口
Kernel-backed private calibration runtime SHALL give each calibration role
invocation an exclusive local TCP port (or equivalent private base URL). The
private driver MUST atomically bind its local HTTP server on `127.0.0.1` with
`port: 0`, attach Vite as middleware, and read the assigned port only after the
server is listening, so there is no discover-then-bind TOCTOU window. Binding,
address-read, or readiness failure MUST fail the role closed.

#### Scenario: 并行两个 candidate 无端口争用
- **WHEN** two calibration invocations run concurrently
- **THEN** each receives an exclusive port, neither encounters `EADDRINUSE`,
  and both produce the same semantic and quality-probe results as serial
  execution

#### Scenario: 端口分配失败
- **WHEN** the private driver cannot bind, read, or validate its Vite service address
- **THEN** the role MUST fail closed and emit only a private diagnostic

### Requirement: 端口/base URL 注入契约
The private calibration driver SHALL derive the private base URL from the
already-listening Vite server and inject that exact value into Playwright's
private runtime environment. Playwright MUST use the external `baseURL` and
disable its fixed `webServer`; Vite is the source of the same value. A consumer
that does not observe the value or falls back to a fixed port MUST cause the
role to fail closed.

#### Scenario: Playwright 与 Vite 消费同一值
- **WHEN** a calibration role runs against a staged fixture
- **THEN** Playwright's `baseURL` and Vite's bound port both derive from the
  single injected private contract value

#### Scenario: 消费者回退固定端口
- **WHEN** a fixture does not consume the injected value or falls back to
  `127.0.0.1:4173`
- **THEN** the role MUST fail closed and produce no valid calibration result

### Requirement: 失败、超时与释放语义
The calibration runtime SHALL treat service-not-ready, timeout, Vite bind or
address-read failure, and failure to close the owned server as a role failure
with a private diagnostic. No partial calibration result SHALL be treated as
valid.

#### Scenario: 服务未就绪或超时
- **WHEN** the dev server does not become ready within the timeout or cannot be
  closed cleanly
- **THEN** the role MUST fail closed with a private diagnostic and no valid
  conclusion is recorded

### Requirement: 端口信息保持私有
The port/base URL MUST remain inside the private calibration runtime. It MUST
NOT appear in the agent workspace, public prompt, ordinary snapshot file list,
Practice payload, trace, or formal record. Public traces and logs record only
the calibration set version and hash.

#### Scenario: 泄露审计
- **WHEN** isolation and snapshot process a candidate with the isolated-port
  runtime
- **THEN** ordinary snapshot files and the agent workspace contain no runtime
  port or private Practice path

### Requirement: 受影响配置以新版本表示
A port-aware fixture configuration MUST be expressed as a new immutable
registry base version and a new `quality-probe/v2` calibration set. Existing
registry bases, calibration sets, and their reproducible identities MUST NOT be
rewritten. Snapshots MUST be regenerated for the new set identity; prior set
source and identity remain reproducible from committed history.

#### Scenario: 旧 set 不被改写
- **WHEN** a candidate migrates to the port-aware configuration
- **THEN** `quality-probe/v1` source and identity remain unchanged and the new
  `quality-probe/v2` set carries the port-aware fixture configuration

#### Scenario: 新版本身份与 snapshot 验证
- **WHEN** a candidate snapshot is regenerated with the new set
- **THEN** snapshot verification re-resolves the new composite identity and
  passes, while a base or overlay change after the snapshot invalidates it

