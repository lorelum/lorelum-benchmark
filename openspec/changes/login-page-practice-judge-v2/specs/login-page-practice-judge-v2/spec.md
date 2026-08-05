## ADDED Requirements

### Requirement: Practice-effect score measures only declared Practice responsibilities
The v2 login-page Practice judge MUST score only the API/page responsibility
boundary declared by `react.api.layered-design`: component transport isolation,
domain-operation delegation, boundary response translation, and raw-response
containment. Functional completion, form ergonomics, visual/UI quality, and
accessibility MUST remain independent semantic or optional quality fields and
MUST NOT contribute to the Practice-effect score.

#### Scenario: Functional success without Practice adherence
- **WHEN** a candidate passes all public login behavior tests but handles
  transport and raw responses in the component
- **THEN** semantic completion is recorded as pass while the Practice score
  records negative evidence independently

#### Scenario: Practice adherence without visual polish
- **WHEN** a candidate satisfies all four API boundary responsibilities but
  omits an optional UI polish signal
- **THEN** the Practice score is unaffected and the UI signal is reported
  separately

### Requirement: Equivalent implementation forms receive equivalent evidence
The v2 judge MUST analyze behavior and resolved data flow rather than exact
source spellings. It MUST accept intermediate expressions, brace-form control
flow, renamed helpers, aliases, alternate pending-state mechanisms, and local
directory layouts when their responsibilities are equivalent.

#### Scenario: Intermediate disabled binding
- **WHEN** controls use `disabled={disabled}` and `disabled` is derived from
  the pending state through a boolean expression
- **THEN** the judge awards the same disabled-control evidence as a direct
  pending-state binding

#### Scenario: Brace-form duplicate guard
- **WHEN** a submit handler uses `if (pending) { return; }`
- **THEN** the judge awards the same duplicate-submit evidence as
  `if (pending) return;`

#### Scenario: Alternate pending-state mechanism
- **WHEN** a candidate uses a calibrated reducer or custom hook that exposes
  equivalent pending, disable, and settle behavior
- **THEN** the judge accepts the implementation without requiring `useState`
  or a particular setter name

### Requirement: Unsupported analysis fails closed
The v2 evidence engine MUST resolve relevant imports and data-flow edges using
its declared analysis capability. An unresolved or ambiguous relevant module
graph MUST produce `indeterminate` with a stable audit reason and MUST NOT be
counted as either positive or negative Practice evidence.

#### Scenario: Unresolved alias
- **WHEN** the submit path imports a relevant operation through an alias that
  the declared resolver cannot resolve
- **THEN** the criterion state is `indeterminate` and no full boundary score is
  awarded

#### Scenario: Ambiguous boundary
- **WHEN** multiple invoked imports could be the submit boundary and the
  engine cannot identify one responsible path
- **THEN** the result is `indeterminate` with the ambiguity reason preserved

### Requirement: V2 calibration gates model comparison
Before any model run selects the v2 judge, calibration MUST include a passing
reference, at least two responsibility-equivalent implementations, a declared
anti-pattern, and an ambiguity fixture. The checks MUST compare raw criteria
and states, not only total scores.

#### Scenario: Calibration rejects equivalent syntax
- **WHEN** any equivalent fixture loses a Practice criterion solely because of
  syntax, naming, or directory layout
- **THEN** v2 calibration fails and model comparison is blocked

#### Scenario: Calibration accepts an anti-pattern
- **WHEN** a declared component-transport or raw-response anti-pattern receives
  the same positive evidence as the reference
- **THEN** v2 calibration fails and model comparison is blocked

#### Scenario: Calibration sees unsupported analysis
- **WHEN** the ambiguity fixture is classified as pass or not-observed instead
  of `indeterminate`
- **THEN** v2 calibration fails and model comparison is blocked

### Requirement: Transport and raw-read evidence is data-flow based
The v2 judge MUST derive transport and raw-read evidence from resolved data flow
rather than source spelling or module-name matching. A page import counts as
transport only when the resolved module performs transport, the page invokes a
binding from it, and the module is not the resolved submit boundary and does not
translate into a domain shape. Raw status/body reads MUST only count when the
receiver is a transport-result identifier.

#### Scenario: Boundary owns transport
- **WHEN** the page imports a domain module that itself calls `fetch` and
  translates authentication responses into a domain result
- **THEN** the judge awards the same isolation and containment evidence as a
  three-layer reference and does not treat the boundary module as imported
  transport

#### Scenario: Non-response object read
- **WHEN** the page accesses `document.body` or other non-response DOM objects
- **THEN** the judge does not count it as a raw response read

#### Scenario: Uncalled transport util
- **WHEN** the page imports a module whose source contains `fetch` but never
  calls any binding from it
- **THEN** the judge does not count the import as component transport

### Requirement: Raw-response containment covers nested returns
The v2 judge MUST recursively inspect return expressions, including nested object
literals and arrays, for raw transport values. Raw property navigation used as an
intermediate step to extract domain data (`response.body.user`) is translation,
not leakage.

#### Scenario: Nested raw leak in a boundary return
- **WHEN** a boundary returns an object such as `{ ok, payload: response.body }`
  that embeds a raw transport value inside a domain-shaped wrapper
- **THEN** the judge fails raw-response-containment and does not award the raw
  value to the component-facing contract

### Requirement: Promise-chain delegation and bare-call fail-closed
The v2 judge MUST accept `.then`/`.catch`/`.finally` promise chains as equivalent
to `await` delegation. A submit handler that invokes a resolved external domain
operation without `await` or a promise chain MUST produce `indeterminate` with a
stable reason, not negative evidence. Awaiting a raw transport adapter is not
domain-operation delegation.

#### Scenario: Promise-chain delegation
- **WHEN** a submit handler calls an external domain operation and chains
  `.then(...).catch(...)` instead of `await`
- **THEN** the judge awards the same delegation evidence as an awaited call

#### Scenario: Bare external call
- **WHEN** a submit handler invokes a resolved external domain operation without
  `await` or a promise chain
- **THEN** the result is `indeterminate` with the reason preserved

#### Scenario: Component awaits a transport adapter
- **WHEN** the page awaits an operation imported from a raw transport module that
  does not translate into a domain shape
- **THEN** the judge does not award domain-operation-delegation for that path

### Requirement: Translation binds to auth success and failure
The v2 judge MUST require the resolved boundary to translate both expected
authentication success (200) and failure (401) into domain-shaped values. A
boundary that translates only the success path and returns raw transport on the
failure path MUST NOT receive full translation evidence.

#### Scenario: Partial translation
- **WHEN** a boundary translates the 200 branch into a domain result but returns
  the raw response on the 401/failure branch
- **THEN** boundary-response-translation fails and raw-response-containment also
  records the raw return

### Requirement: Component selection is deterministic
The v2 judge MUST select the page component deterministically independent of
SourceMap key order, preferring a `LoginPage`-named module and falling back to
lexicographic path order among modules with form submit handlers.

#### Scenario: File ordering does not change the score
- **WHEN** a shared form component file precedes the login page in the SourceMap
- **THEN** the judge still scores the login page and returns the same criterion
  evidence

### Requirement: Non-source imports are irrelevant
The v2 judge MUST treat CSS/asset (non-source) imports as irrelevant regardless
of import form: named/default imports and side-effect imports must both be
ignored rather than unresolved or silently skipped. Only unresolved or ambiguous
source imports fail closed.

#### Scenario: CSS module import
- **WHEN** the page imports `styles from './LoginPage.module.css'`
- **THEN** the judge returns an observed result and does not classify the import
  as unresolved

#### Scenario: CSS side-effect import
- **WHEN** the page imports `'./LoginPage.css'` as a side effect
- **THEN** the judge treats it the same as other non-source imports and returns
  the same criterion evidence

### Requirement: Calibration covers review blind spots with criterion-direction assertions
The v2 calibration matrix MUST include fixtures for two-layer boundaries, nested
raw leakage, partial translation, promise chains, bare calls, file ordering, CSS
imports, and uncalled transport utils. Anti-pattern separation MUST assert
criterion directions (which criteria must be zero), not only total-score gaps.

#### Scenario: Anti-pattern criterion directions
- **WHEN** a declared component-transport anti-pattern receives zero points on
  component-transport-isolation and raw-response-containment but the total gap
  alone is satisfied
- **THEN** calibration passes only when the required criteria are also zero
