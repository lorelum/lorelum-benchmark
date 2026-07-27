## ADDED Requirements

### Requirement: Versioned Kernel And Public Materialization

The system MUST provide a versioned Practice candidate kernel contract and a candidate-specific public overlay contract. Materializing a candidate MUST produce an agent input containing only the resolved public task material and starter source. It MUST NOT copy or read a candidate's private Practice, oracle, evaluator, quality probe, calibration fixture, or private condition text into the agent workspace.

#### Scenario: Materialize a candidate with private evaluation material

- **WHEN** a maintainer materializes a declared Practice candidate
- **THEN** the resolved workspace contains only the declared public task and starter files
- **AND THEN** it contains no file, path, or contents from the candidate's private evaluation tree

### Requirement: Kernel Compatibility Is Explicit

Every candidate declaration MUST name an immutable kernel version and public overlay inputs. A candidate MUST NOT rely on an unversioned shared starter or ambient dependency tree.

#### Scenario: Candidate references a kernel

- **WHEN** a maintainer reviews a candidate declaration
- **THEN** the declaration identifies the kernel version and the public overlay inputs used to resolve its starter
- **AND THEN** those inputs can be resolved without candidate-private data
