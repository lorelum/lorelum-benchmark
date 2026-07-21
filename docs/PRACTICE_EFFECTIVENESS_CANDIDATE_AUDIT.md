# Practice-effectiveness source-derived candidate audit

Issue: [#43](https://github.com/lorelum/lorelum-benchmark/issues/43)

## Status and decision boundary

This document freezes an auditable *design-candidate* pool. It does not create
an incubator fixture, a suite task, a treatment, a snapshot, or a run record.
The six recommended items are not pilots or frozen tasks. They may move to
`incubator/practice-effectiveness/` only after the selection in this document
is confirmed and an independent public/private leakage review is complete.

The user authorized the use of `source-derived-test-practice` material where
the source repository lacks a team-authored Practice artifact. These profiles
are benchmark test material, not evidence that a team has adopted the
Practice. An experiment can test the content and relevance of a profile for a
frozen task; it cannot establish product-wide effectiveness, production safety,
or dynamic injection timing.

All future treatments are static system-prompt injections in the current Pi
runner. Each experiment must hold the task kernel, starter, model, system
prompt, tool policy, budget, and clean workspace constant across baseline,
oracle-practice, lorelum-retrieval, and irrelevant-practice conditions.

## Source audit

| Source | Frozen source snapshot | Source-supported behavior | Exclusion or boundary |
| --- | --- | --- | --- |
| Lorelum format schema | [PR #9](https://github.com/lorelum/lorelum/pull/9), [`2b32bb4`](https://github.com/lorelum/lorelum/commit/2b32bb40adae303e7d5f1c6baa6a046c99313421) | Pack and Practice input shapes are validated. | Does not define a production incident or a team Practice. |
| Lorelum format validation | [PR #10](https://github.com/lorelum/lorelum/pull/10), [`bd0479b`](https://github.com/lorelum/lorelum/commit/bd0479b8bc02f5a1d1aa445cfa377875c4fe8bb4) | Format failures stop semantic checks; duplicate IDs, dangling references, and decision cycles are errors; reports have error/warning/info buckets. | Does not support stable diagnostic ordering, complete accumulation, body-reference validation, or dependency resolution. |
| Lorelum frontmatter parser | [PR #11](https://github.com/lorelum/lorelum/pull/11), [`de1ce39`](https://github.com/lorelum/lorelum/commit/de1ce3920f54c39fb03f2c8c9052f60ff95fe1be) | Malformed frontmatter is a parse failure. | Seed fixtures in the open PR #12 are not sources. |
| Notify-bus ingestion and routing | [PR #2](https://github.com/lorelum/notify-bus/pull/2), [`a183188`](https://github.com/lorelum/notify-bus/commit/a18318885755049f7a80ccc29ccbc123d5958d69) | Webhook verification uses raw input before parsing; missing or malformed configuration does not dispatch; routes use priority and viable channels. | All benchmark fixtures must use local test secrets, fake adapters, and no network. |
| Notify-bus filtering | [PR #11](https://github.com/lorelum/notify-bus/pull/11), [`0c6df34`](https://github.com/lorelum/notify-bus/commit/0c6df34130dc72e8d6a256d4442adeae36609fa5) | Explicit action exclusion overrides positive action matching. | This is a route-selection boundary, not a generic query rule. |
| Notify-bus payload normalization | [PR #12](https://github.com/lorelum/notify-bus/pull/12), [`65b8ff1`](https://github.com/lorelum/notify-bus/commit/65b8ff10beafc84f7be4a6f7eea74b06322eba2b) | Organization-scoped payloads can supply repository facts when a top-level repository is absent. | Fixtures must not contain real organization or member data. |
| Notify-bus deployment hardening | [PR #5](https://github.com/lorelum/notify-bus/pull/5), [`d2a5a07`](https://github.com/lorelum/notify-bus/commit/d2a5a07bbe5e2b3cde3b9a3bd2db3a256d695123) | An unauthenticated admin API defaults to loopback host binding and expects TLS reverse-proxy exposure. | The benchmark checks static configuration only; it does not claim a deployed host is safe. |

The old `pe-*` tasks in PR #37–#41 and the historic deleted shapes are
`contract-derived seed` material. They may inform coverage vocabulary only.
They are not source evidence and are not restored by this document.

## Existing PR disposition

PR #37–#41 contain useful process lessons: their later commits correctly move
the material into `incubator/`, add source-audit and reuse-card placeholders,
and keep evaluator material private. They do not contain a reusable shared
evaluator helper or a source-backed task contract. Their task semantics remain
the original `contract-derived seed` semantics, so merging any of them would
wrongly preserve a causal claim this audit rejects.

| PR | Current value | Required disposition |
| --- | --- | --- |
| [#37](https://github.com/lorelum/lorelum-benchmark/pull/37) untrusted metadata | Public/private fixture layout only. The plugin-manifest behavior is not a verified source-backed candidate. | Do not merge or transplant the fixture. Close as superseded by #43 after this audit PR is reviewed. |
| [#38](https://github.com/lorelum/lorelum-benchmark/pull/38) cross-reference integrity | Its multi-file kernel shape is directionally related to C06, but the registry semantics and treatments are seed-derived. | Do not merge. Recreate C06 on a fresh branch from the Lorelum format source; preserve #38 only as history. |
| [#39](https://github.com/lorelum/lorelum-benchmark/pull/39) deterministic query boundaries | The local query behavior is not the notify-bus route-selection source used by C13. | Do not merge or reuse its semantic fixture; close as superseded by #43. |
| [#40](https://github.com/lorelum/lorelum-benchmark/pull/40) structured validation errors | Its ordering and complete-accumulation expectations exceed the actual source evidence. | Do not merge. Recreate C10 from report-grading semantics only; close as superseded by #43. |
| [#41](https://github.com/lorelum/lorelum-benchmark/pull/41) pack/domain consistency | It assumes dependency-resolution behavior that conflicts with Lorelum v1, where non-empty `depends_on` is a warning and is ignored. | Close as invalid/superseded; do not reuse its task semantics. C09 is the source-correct replacement. |

Closing these PRs is intentionally deferred until this audit document is
reviewed. A closing comment should link to #43 and state whether the successor
is C06, C09, C10, C13, C16, or C20. Their Git history remains the immutable
record of the discarded seed exploration; no second mutable archive is needed.

## Source-derived validation profiles

Every profile below will later have an independent, private revision containing
its source snapshot, Oracle intervention, matched irrelevant control, adherence
probes, exclusions, and conclusion boundary. Controls and probes must not be
reused between profiles. This table deliberately omits treatment text and
private evaluator details.

| Profile ID | Provenance | Applicable scenario | Baseline miss hypothesis | Profile-specific boundary |
| --- | --- | --- | --- | --- |
| `pformat.schema-gate/v1` | Lorelum PRs #9–#11 | Parsing and validating local authoring input. | Accepts malformed input, fabricates a value, or continues semantic processing after format failure. | No diagnostic-order or complete-accumulation claim. |
| `pformat.reference-graph/v1` | Lorelum PR #10 | Publishing a local pack with decisions that reference other entries. | Performs only file-local checks and misses duplicate or dangling global relationships. | No claim about body references, which v1 does not validate. |
| `pformat.report-grading/v1` | Lorelum PR #10 | Returning validation outcomes to a caller. | Collapses severity levels or treats non-blocking feedback as invalid. | No stable ordering requirement. |
| `pformat.v1-compat-boundary/v1` | Lorelum ADR 0003 and PR #10 | Handling declared but unsupported v1 metadata. | Rejects, silently implements, or silently ignores an unsupported feature. | No dependency resolver or module-ownership claim. |
| `pnotify.config-fail-closed/v1` | Notify-bus PR #2 | Loading local notification configuration before side effects. | Falls back to invented defaults or dispatches with no usable configuration. | Does not prescribe fail-closed behavior for every product. |
| `pnotify.route-selection/v1` | Notify-bus PRs #2 and #11 | Selecting a viable notification route from local configuration. | Depends on source order, mishandles filtering conflicts, or stops at an unavailable target. | Does not generalize to database sorting or pagination. |
| `pnotify.raw-webhook-auth/v1` | Notify-bus PR #2 | Receiving untrusted local webhook requests. | Parses or transforms input before verification, or proceeds after failed authorization. | Does not cover development mode without a configured secret. |
| `pnotify.payload-fallback/v1` | Notify-bus PR #12 | Normalizing local organization-scoped event payloads. | Drops known organization facts or invents unsupported defaults. | Does not justify guessing arbitrary missing data. |
| `pnotify.loopback-deployment/v1` | Notify-bus PR #5 | Configuring a local deployment with an unauthenticated management surface. | Leaves the host port broadly exposed by default. | Does not validate a live proxy, firewall, or deployed host. |

## Candidate-card conventions

Each card below includes the required Task Card and Reuse Card information in
compact form. “Private acceptance” means a future evaluator must separately
record functional result and profile adherence; it is not a published Oracle or
reference answer. All cards use fixed local fixtures and Bun tests, have no
network or clock dependency, and remain pre-incubator candidates until review.

### C01 — `pe-pack-metadata-contract`

- **Source evidence / frozen snapshot:** Lorelum PR #9 at `2b32bb4`.
- **Task kernel and prompt:** `metadata-contract`; tags `release-metadata`, `untrusted-input`. Prompt: repair a local release-descriptor validator so invalid metadata cannot proceed.
- **Relevant profile / control:** `pformat.schema-gate/v1`; its own matched unrelated control is required.
- **Private acceptance / baseline miss:** Functional acceptance uses fixed valid and invalid metadata fixtures. The profile probe distinguishes a rejected shape from a result that wrongly continues into later processing. Baseline may only check field presence.
- **Confounders, runtime, lifecycle, coverage:** Do not publish field patterns or hidden cases. Run locally with Bun. `pre-incubator candidate`, `not reusable`; lower-priority release-metadata coverage than C09.
- **Reuse Card:** Eligible profile: schema gate only. Shared fixture/evaluator: local metadata parser. Leakage risk: schema details. Snapshot: pending. Decision: not reusable.

### C02 — `pe-practice-frontmatter-contract`

- **Source evidence / frozen snapshot:** Lorelum PR #9 at `2b32bb4`.
- **Task kernel and prompt:** `frontmatter-contract`; tags `untrusted-input`, `metadata`. Prompt: make a local entry loader reject incomplete or incorrectly typed descriptions while retaining usable entries.
- **Relevant profile / control:** `pformat.schema-gate/v1`; a newly authored, profile-owned unrelated control is required.
- **Private acceptance / baseline miss:** Functional acceptance uses fixed frontmatter fixtures. The adherence probe checks that malformed input does not become a fabricated entry. Baseline may validate only a subset of fields.
- **Confounders, runtime, lifecycle, coverage:** No production Practice text or hidden fixtures in public material. Bun only. `pre-incubator candidate`, `not reusable`; overlaps C01 and C03.
- **Reuse Card:** Eligible profile: schema gate only. Shared fixture/evaluator: frontmatter loader. Leakage risk: field requirements. Snapshot: pending. Decision: not reusable.

### C03 — `pe-frontmatter-parse-boundary`

- **Source evidence / frozen snapshot:** Lorelum PR #11 at `de1ce39`.
- **Task kernel and prompt:** `frontmatter-parse-boundary`; tags `untrusted-input`, `error-boundary`. Prompt: make local content import return a usable failure for damaged header configuration rather than a made-up entry.
- **Relevant profile / control:** `pformat.schema-gate/v1`; a profile-owned payload-normalization control is required.
- **Private acceptance / baseline miss:** Functional acceptance covers valid and malformed local text. Adherence distinguishes an explicit parse failure from swallowed exceptions or fabricated configuration. Baseline may return a partial object.
- **Confounders, runtime, lifecycle, coverage:** No remote files. Bun only. `pre-incubator candidate`, `not reusable`; an alternative to C02 rather than an additional pilot.
- **Reuse Card:** Eligible profile: schema gate only. Shared fixture/evaluator: parser harness. Leakage risk: parser error details. Snapshot: pending. Decision: not reusable.

### C04 — `pe-format-semantic-gate`

- **Source evidence / frozen snapshot:** Lorelum PR #10 at `bd0479b`.
- **Task kernel and prompt:** `validation-stage-gate`; tags `untrusted-input`, `structured-diagnostics`, `error-boundary`. Prompt: repair a local validation command so damaged input does not produce misleading follow-on results.
- **Relevant profiles / controls:** `pformat.schema-gate/v1` and `pformat.report-grading/v1`, each with separately authored unrelated controls and probes.
- **Private acceptance / baseline miss:** Functional acceptance uses malformed input that would also cause relationship failures. One profile measures stopping later checks; the other measures consumer-visible result semantics. Baseline may aggregate noise.
- **Confounders, runtime, lifecycle, coverage:** It must not introduce ordering or complete-accumulation requirements. Bun only. `pre-incubator candidate`, reusable after independent profile review; reserve for a later shared-kernel study.
- **Reuse Card:** Eligible profiles: schema gate and report grading for distinct reasons. Shared fixture/evaluator: staged validation harness. Leakage risk: stage behavior. Snapshot: pending. Decision: reusable only after two independent controls and probes exist.

### C05 — `pe-duplicate-practice-identities`

- **Source evidence / frozen snapshot:** Lorelum PR #10 at `bd0479b`.
- **Task kernel and prompt:** `reference-graph`; tag `cross-file-integrity`. Prompt: repair a local pre-publish check so conflicting entries cannot enter the artifact.
- **Relevant profile / control:** `pformat.reference-graph/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance uses a fixed multi-file conflict. The probe checks a global scan instead of file-local validation. Baseline may pass every file independently.
- **Confounders, runtime, lifecycle, coverage:** Do not expose identities or private test layout. Bun only. `pre-incubator candidate`, not reusable; merge into C06’s future fixture set rather than select independently.
- **Reuse Card:** Eligible profile: reference graph only. Shared fixture/evaluator: multi-file graph check. Leakage risk: identity rule. Snapshot: pending. Decision: not reusable.

### C06 — `pe-dangling-recommendation-reference`

- **Source evidence / frozen snapshot:** Lorelum PR #10 at `bd0479b`.
- **Task kernel and prompt:** `reference-graph`; tags `cross-file-integrity`, `dangling-reference`. Prompt: repair local decision configuration validation so publication cannot point to an unavailable entry.
- **Relevant profile / control:** `pformat.reference-graph/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance uses a fixed multi-file unresolved target. The adherence probe checks that all relevant targets are resolved, not only a visible one. Baseline may validate decision shape only.
- **Confounders, runtime, lifecycle, coverage:** Body references are excluded because v1 does not validate them. Bun only. `recommended pre-incubator candidate`; the cross-file pilot representative.
- **Reuse Card:** Eligible profile: reference graph only. Shared fixture/evaluator: graph resolution harness. Leakage risk: reference field names and fixture shape. Snapshot: pending. Decision: not reusable.

### C07 — `pe-dangling-decision-next`

- **Source evidence / frozen snapshot:** Lorelum PR #10 at `bd0479b`.
- **Task kernel and prompt:** `decision-reference-graph`; tags `cross-file-integrity`, `workflow-boundary`. Prompt: repair local flow validation so users cannot reach an unavailable follow-up step.
- **Relevant profile / control:** `pformat.reference-graph/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance uses a fixed multi-node flow. The adherence probe checks resolution across branches. Baseline may inspect only the initial node.
- **Confounders, runtime, lifecycle, coverage:** Do not reveal traversal or graph algorithm. Bun only. `pre-incubator candidate`, not reusable; consolidate with C06/C08 fixtures.
- **Reuse Card:** Eligible profile: reference graph only. Shared fixture/evaluator: graph check. Leakage risk: edge names. Snapshot: pending. Decision: not reusable.

### C08 — `pe-decision-cycle-rejection`

- **Source evidence / frozen snapshot:** Lorelum PR #10 at `bd0479b`.
- **Task kernel and prompt:** `decision-cycle`; tags `cross-file-integrity`, `cycle-safety`. Prompt: make a local flow check block configurations that cannot complete.
- **Relevant profile / control:** `pformat.reference-graph/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance distinguishes fixed cyclic and acyclic fixtures. The adherence probe covers source-supported cycle shapes without exposing them. Baseline may only catch the simplest loop.
- **Confounders, runtime, lifecycle, coverage:** Bound graph size; no performance claim. Bun only. `pre-incubator candidate`, not reusable; consolidate with C06.
- **Reuse Card:** Eligible profile: reference graph only. Shared fixture/evaluator: cycle harness. Leakage risk: graph topology. Snapshot: pending. Decision: not reusable.

### C09 — `pe-declared-dependency-compatibility`

- **Source evidence / frozen snapshot:** Lorelum ADR 0003 and PR #10 at `bd0479b`.
- **Task kernel and prompt:** `declared-v1-compatibility`; tags `release-compatibility`, `dependency-boundary`, `structured-diagnostics`. Prompt: repair a local release check so existing descriptor fields receive compatible treatment in the current format version.
- **Relevant profile / control:** `pformat.v1-compat-boundary/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance checks a consumer-usable validation result. The profile probe distinguishes source-supported non-blocking compatibility feedback from silently ignored or invented dependency behavior. Baseline may reject, silently accept, or attempt unsupported resolution.
- **Confounders, runtime, lifecycle, coverage:** Explicitly excludes dependency resolution, module ownership, and the old pack/domain seed. Bun only. `recommended pre-incubator candidate`; release/dependency coverage representative.
- **Reuse Card:** Eligible profile: v1 compatibility boundary only. Shared fixture/evaluator: report harness. Leakage risk: unsupported-field semantics. Snapshot: pending. Decision: not reusable.

### C10 — `pe-validation-report-grading`

- **Source evidence / frozen snapshot:** Lorelum PR #10 at `bd0479b`.
- **Task kernel and prompt:** `validation-report`; tags `structured-diagnostics`, `compatibility`. Prompt: repair a local validation API so callers can distinguish blocking outcomes from non-blocking feedback.
- **Relevant profile / control:** `pformat.report-grading/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance checks a structured report. The profile probe checks the source-supported relationship between outcome grades and validity, separately from functional structure. Baseline may flatten grades or mark non-blocking feedback as invalid.
- **Confounders, runtime, lifecycle, coverage:** Ordering and full error accumulation are excluded. Bun only. `recommended pre-incubator candidate`; structured-diagnostics representative.
- **Reuse Card:** Eligible profile: report grading only. Shared fixture/evaluator: report harness. Leakage risk: result semantics. Snapshot: pending. Decision: not reusable.

### C11 — `pe-no-config-no-dispatch`

- **Source evidence / frozen snapshot:** Notify-bus PR #2 at `a183188`.
- **Task kernel and prompt:** `no-dispatch-on-absent-config`; tags `configuration-boundary`, `side-effect-safety`. Prompt: repair local event routing so unavailable service configuration returns a handled result without sending a notification.
- **Relevant profile / control:** `pnotify.config-fail-closed/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance checks local status. The adherence probe independently verifies no fake adapter call. Baseline may synthesize a default route.
- **Confounders, runtime, lifecycle, coverage:** Only in-memory adapters; no credentials or network. Bun only. `pre-incubator candidate`, not reusable; reserve rather than select.
- **Reuse Card:** Eligible profile: config fail closed only. Shared fixture/evaluator: route harness and fake adapter. Leakage risk: status wording. Snapshot: pending. Decision: not reusable.

### C12 — `pe-malformed-config-failure`

- **Source evidence / frozen snapshot:** Notify-bus PR #2 at `a183188`.
- **Task kernel and prompt:** `malformed-config-boundary`; tags `untrusted-input`, `configuration-boundary`, `side-effect-safety`. Prompt: make a local service stop at a handled configuration failure rather than continue with guessed settings.
- **Relevant profiles / controls:** `pnotify.config-fail-closed/v1` and `pformat.schema-gate/v1`; each needs a separate unrelated control and probe.
- **Private acceptance / baseline miss:** Functional acceptance checks valid and malformed local configuration. The two probes distinguish no side effect from no fabricated configuration. Baseline may swallow parse errors.
- **Confounders, runtime, lifecycle, coverage:** No actual configuration or external connection. Bun only. `pre-incubator candidate`, reusable after independent profile review; reserve for a later kernel-reuse study.
- **Reuse Card:** Eligible profiles: config fail closed and schema gate for distinct reasons. Shared fixture/evaluator: parser, result, and fake adapter. Leakage risk: default behavior. Snapshot: pending. Decision: reusable only after independent controls and probes exist.

### C13 — `pe-priority-route-selection`

- **Source evidence / frozen snapshot:** Notify-bus PR #2 at `a183188`.
- **Task kernel and prompt:** `notification-route-selection`; tags `deterministic-selection`, `configuration-boundary`. Prompt: repair local notification routing so a matching event consistently reaches the expected usable target.
- **Relevant profile / control:** `pnotify.route-selection/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance checks a selected target across fixed configurations. The adherence probe checks source-order independence and no attempted delivery to unavailable targets. Baseline may choose the first source-order match.
- **Confounders, runtime, lifecycle, coverage:** No clock, database, or network. The prompt does not state priority or precedence rules. Bun only. `recommended pre-incubator candidate`; deterministic-selection representative.
- **Reuse Card:** Eligible profiles: route selection and, for a distinct filtering rationale, its future precedence profile. Shared fixture/evaluator: route harness. Leakage risk: selection rules. Snapshot: pending. Decision: reusable only after the two profiles are independently frozen.

### C14 — `pe-action-exclusion-precedence`

- **Source evidence / frozen snapshot:** Notify-bus PR #11 at `0c6df34`.
- **Task kernel and prompt:** `notification-route-selection`; tags `deterministic-selection`, `exception-boundary`. Prompt: repair local event filtering so explicitly unwanted notifications are not sent.
- **Relevant profile / control:** `pnotify.route-selection/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance uses conflict and non-conflict event fixtures. The probe checks the source-supported conflict boundary and no dispatch. Baseline may use only the positive filter.
- **Confounders, runtime, lifecycle, coverage:** The public prompt must not name the filter fields or precedence. Bun and fake adapters only. `pre-incubator candidate`; make it a hidden boundary fixture for C13 instead of a separate pilot.
- **Reuse Card:** Eligible profile: route selection only in the current set. Shared fixture/evaluator: C13 route harness. Leakage risk: precedence vocabulary. Snapshot: pending. Decision: not reusable as an independent task.

### C15 — `pe-disabled-channel-fallthrough`

- **Source evidence / frozen snapshot:** Notify-bus PR #2 at `a183188`.
- **Task kernel and prompt:** `route-viability`; tags `state-boundary`, `deterministic-selection`. Prompt: repair local notification routing so an unavailable target does not cause a deliverable event to be lost.
- **Relevant profile / control:** `pnotify.route-selection/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance checks the eventual target. The probe independently checks that an unavailable fake adapter is never called. Baseline may stop at the first matching route.
- **Confounders, runtime, lifecycle, coverage:** No real channels, permissions, or retries. Bun only. `pre-incubator candidate`; make it a C13 boundary fixture.
- **Reuse Card:** Eligible profile: route selection only. Shared fixture/evaluator: fake adapter route harness. Leakage risk: target-state details. Snapshot: pending. Decision: not reusable.

### C16 — `pe-webhook-raw-body-verification`

- **Source evidence / frozen snapshot:** Notify-bus PR #2 at `a183188`.
- **Task kernel and prompt:** `raw-webhook-ingress`; tags `untrusted-input`, `authentication`, `side-effect-safety`. Prompt: repair a local webhook entry point so invalid requests do not reach event processing.
- **Relevant profile / control:** `pnotify.raw-webhook-auth/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance checks a legitimate fixed local request. The adherence probe checks source-supported raw-input verification ordering and no side effect for rejected input without publishing vectors or a reference implementation. Baseline may parse or transform before verification.
- **Confounders, runtime, lifecycle, coverage:** Test-only secret, in-memory requests, and fake adapters only. No real webhooks. Bun only. `recommended pre-incubator candidate`; untrusted-input representative.
- **Reuse Card:** Eligible profile: raw webhook auth only. Shared fixture/evaluator: request harness. Leakage risk: authentication details. Snapshot: pending. Decision: not reusable.

### C17 — `pe-webhook-signature-rejection`

- **Source evidence / frozen snapshot:** Notify-bus PR #2 at `a183188`.
- **Task kernel and prompt:** `webhook-rejection`; tags `untrusted-input`, `authentication`, `negative-path`. Prompt: complete local webhook rejection behavior so unauthorized input cannot create a notification.
- **Relevant profile / control:** `pnotify.raw-webhook-auth/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance checks rejection status for fixed negative cases. The probe records no route or fake-adapter side effect. Baseline may return the expected status after already handling the event.
- **Confounders, runtime, lifecycle, coverage:** No real key-management or network. Bun only. `pre-incubator candidate`; make it a C16 boundary fixture.
- **Reuse Card:** Eligible profile: raw webhook auth only. Shared fixture/evaluator: C16 request harness. Leakage risk: signature cases. Snapshot: pending. Decision: not reusable.

### C18 — `pe-webhook-post-auth-parse-failure`

- **Source evidence / frozen snapshot:** Notify-bus PR #2 at `a183188`.
- **Task kernel and prompt:** `authenticated-parse-boundary`; tags `untrusted-input`, `error-boundary`, `side-effect-safety`. Prompt: repair a local event entry point so transport-authorized but unreadable content cannot continue to routing.
- **Relevant profile / control:** `pnotify.raw-webhook-auth/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance checks a handled content failure. The probe records no route or fake-adapter side effect. Baseline may equate authorization with safe processability.
- **Confounders, runtime, lifecycle, coverage:** No response-text score and no external HTTP. Bun only. `pre-incubator candidate`; make it a C16 boundary fixture.
- **Reuse Card:** Eligible profile: raw webhook auth only. Shared fixture/evaluator: C16 request harness. Leakage risk: status and payload details. Snapshot: pending. Decision: not reusable.

### C19 — `pe-org-event-normalization`

- **Source evidence / frozen snapshot:** Notify-bus PR #12 at `65b8ff1`.
- **Task kernel and prompt:** `event-payload-normalization`; tags `untrusted-input`, `compatibility`, `metadata-integrity`. Prompt: repair local event normalization so organization-scoped payloads retain usable ownership and link facts when common fields are absent.
- **Relevant profile / control:** `pnotify.payload-fallback/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance checks anonymous local organization-event fixtures. The probe distinguishes preserving source-provided fallback facts from inventing unsupported defaults. Baseline may emit unknown values.
- **Confounders, runtime, lifecycle, coverage:** No real organization/member data or network. Bun only. `pre-incubator candidate`, not reusable; defer behind the six recommended items.
- **Reuse Card:** Eligible profile: payload fallback only. Shared fixture/evaluator: normalizer harness. Leakage risk: fallback source. Snapshot: pending. Decision: not reusable.

### C20 — `pe-loopback-admin-deployment`

- **Source evidence / frozen snapshot:** Notify-bus PR #5 at `d2a5a07`.
- **Task kernel and prompt:** `loopback-service-exposure`; tags `deployment-security`, `network-boundary`, `configuration`. Prompt: repair local deployment configuration so an unauthenticated management surface is not broadly exposed by default.
- **Relevant profile / control:** `pnotify.loopback-deployment/v1`; profile-owned unrelated control required.
- **Private acceptance / baseline miss:** Functional acceptance checks that configuration can be loaded. The adherence probe statically verifies source-supported host exposure boundaries without starting a container or publishing exact private assertions. Baseline may leave a broad host binding.
- **Confounders, runtime, lifecycle, coverage:** No Docker daemon, port scan, proxy, or real deployment. Bun/YAML static tests only. `recommended pre-incubator candidate`; independent high-frequency workflow representative.
- **Reuse Card:** Eligible profile: loopback deployment only. Shared fixture/evaluator: static Compose parser. Leakage risk: binding details. Snapshot: pending. Decision: not reusable.

## Recommended six and coverage matrix

| Coverage target | Candidate | Profile | Reason to choose | Boundary |
| --- | --- | --- | --- | --- |
| Release/dependency consistency | C09 | `pformat.v1-compat-boundary/v1` | Real v1 behavior replaces the old seed’s contradictory dependency-resolution assumption. | No real resolver or ownership claim. |
| Cross-file reference integrity | C06 | `pformat.reference-graph/v1` | Bounded local multi-file publication check. | No body-reference validation. |
| Untrusted input boundary | C16 | `pnotify.raw-webhook-auth/v1` | Real verification ordering and local test vectors. | No live-webhook security claim. |
| Deterministic selection boundary | C13 | `pnotify.route-selection/v1` | Real priority-based route selection; C14/C15 become boundary fixtures. | No database-query claim. |
| Structured diagnostics | C10 | `pformat.report-grading/v1` | Tests only report grading semantics actually present in source. | No sorting or complete-accumulation claim. |
| Independent high-frequency workflow | C20 | `pnotify.loopback-deployment/v1` | Real deployment hardening with no runtime external dependency. | Static configuration only. |

This set uses six distinct profiles, has one cross-file task (C06), one
untrusted-input boundary task (C16), one deterministic task (C13), and no
profile appears more than once. It is a recommendation pending maintainer
confirmation, not a pilot freeze.

## Non-selected candidate disposition

| Candidates | Disposition | Reason |
| --- | --- | --- |
| C01–C03 | Defer | Duplicate parsing/schema coverage; do not inflate a single source behavior into multiple pilots. |
| C04 | Reserve | A useful reusable-kernel study, but not needed for the first six independent profiles. |
| C05, C07, C08 | Merge into C06 fixtures | Same reference-graph profile; separate pilots would repeat the causal claim. |
| C11, C12 | Reserve | Real behavior, but less diverse than the selected directions. |
| C14, C15 | Merge into C13 fixtures | Filtering and viable-target boundaries of the same routing kernel. |
| C17, C18 | Merge into C16 fixtures | Negative paths of the same webhook-auth profile. |
| C19 | Defer | Genuine compatibility behavior, but weaker independent workflow evidence than C20. |

## Implementation gate

Before implementation, confirm the six recommended candidates and assign an
independent reviewer for profile relevance and intervention leakage. Then, and
only then:

1. Create each task kernel under `incubator/practice-effectiveness/` with
   `public/task.yaml`, `public/task.md`, and `public/starter/` only.
2. Keep all evaluator, Oracle, reference, profile, and scoring material under
   `private/`; do not copy it into an agent workspace.
3. Create private, profile-specific Oracle/control/adherence material. A
   functional pass must not imply profile adherence.
4. Freeze a source snapshot and task snapshot, run the candidate evaluator,
   and run `bun run validate` after fixture changes.
5. Verify the four conditions under identical model, prompt, tool, budget, and
   clean-workspace settings. Create a separate experiment matrix and run
   records only after the candidate passes review.

No formal benchmark result exists until an immutable artifact checksum manifest
and run record have been created.
