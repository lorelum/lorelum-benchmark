## ADDED Requirements

### Requirement: 每次调用独占的 calibration runtime 端口
Kernel-backed private calibration runtime SHALL allocate an exclusive local
TCP port (or equivalent private base URL) for each calibration role invocation.
Allocation MUST atomically bind a listening socket and read its assigned port
so there is no discover-then-bind TOCTOU window. A held port MUST NOT be reused
within one runtime. Allocation failure, invalid values, or out-of-range ports
MUST fail closed before any role runs.

#### Scenario: 并行两个 candidate 无端口争用
- **WHEN** two calibration invocations run concurrently
- **THEN** each receives an exclusive port, neither encounters `EADDRINUSE`,
  and both produce the same semantic and quality-probe results as serial
  execution

#### Scenario: 端口分配失败
- **WHEN** port allocation cannot bind an exclusive port or receives an invalid
  value
- **THEN** the runtime MUST fail closed before invoking the role and emit only
  a private diagnostic

### Requirement: 端口/base URL 注入契约
The kernel SHALL inject the private base URL (and port where needed) into the
calibration role's private runtime environment through a single contract.
Playwright and Vite MUST consume the same private value: Playwright uses an
external `baseURL` and disables its fixed `webServer`, while Vite binds the dev
server to the held port. A consumer that does not observe the injected value or
that falls back to a fixed port MUST cause the role to fail closed.

#### Scenario: Playwright 与 Vite 消费同一值
- **WHEN** a calibration role runs against a staged fixture
- **THEN** Playwright's `baseURL` and Vite's bound port both derive from the
  single injected private contract value

#### Scenario: 消费者回退固定端口
- **WHEN** a fixture does not consume the injected value or falls back to
  `127.0.0.1:4173`
- **THEN** the role MUST fail closed and produce no valid calibration result

### Requirement: 失败、超时与释放语义
The calibration runtime SHALL treat service-not-ready, timeout, allocation
failure, and double-release of a held port as a role failure with a private
diagnostic. Released ports MUST be verified free. No partial calibration
result SHALL be treated as valid.

#### Scenario: 服务未就绪或超时
- **WHEN** the dev server does not become ready within the timeout or the port
  cannot be released cleanly
- **THEN** the role MUST fail closed with a private diagnostic and no valid
  conclusion is recorded

#### Scenario: 重复释放
- **WHEN** a held port is released twice or an unheld port is released
- **THEN** the runtime MUST fail closed

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