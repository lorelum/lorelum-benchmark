## ADDED Requirements

### Requirement: Versioned Track-Agnostic Core

The system MUST provide a versioned benchmark candidate workspace kernel core (core/v1) that is
track-agnostic. The core MUST provide materialization, public/private isolation, path safety, hash
fixation and declarative-role calibration orchestration. The core MUST NOT interpret any domain-specific
fields of a candidate or task, including Practice cards, conditions semantics, rule audits, oracle content
or quality-probe definitions.

#### Scenario: Core materializes a candidate without reading domain fields

- **WHEN** a maintainer materializes a declared candidate through the core
- **THEN** the core dispatches the declared materializer and produces a workspace
- **AND THEN** the core never parses candidate domain semantics to construct the workspace

### Requirement: Explicit Kernel Declaration And Track Key

Every kernel-backed candidate or task MUST declare a kernel block naming an immutable core version, a
profile version and a materializer_kind. The kernel.profile field MUST be the authoritative track
distinguisher (injection-calibration for Practice injection, 	reatment-comparison for Skill). A
candidate MUST NOT rely on an unversioned shared starter or ambient dependency tree.

#### Scenario: Reviewer identifies the track from a declaration

- **WHEN** a maintainer reviews a candidate or task declaration
- **THEN** the kernel.profile field identifies the track and calibration model
- **AND THEN** the declared core version, profile and materializer_kind can be resolved without
candidate-private data

### Requirement: Materializer Kind Is Extensible

The core contract MUST carry a materializer_kind field. The first version MUST implement eact-vite.
Adding a new technology stack MUST be done by adding a new materializer, not by upgrading the core major
version. A frozen candidate or task MUST NOT be forced to re-pin its core version when a new materializer
is added.

#### Scenario: A new stack is introduced

- **WHEN** a maintainer adds a Next.js or other stack materializer
- **THEN** existing core/v1-pinned candidates remain valid without re-pinning
- **AND THEN** the new materializer is selectable via materializer_kind without a core major bump