# Public case candidates

This ledger is a screened candidate pool for the version 0.4.0 fixture set.
It is deliberately separate from the selection matrix: a row is not a task
admission and does not authorise copying source code, a patch, test wording, or
a Vercel rule into either the public prompt or private evaluator. Each source
was read on 2026-07-20 for its reported mechanism, not for a solution.

Before a row moves into a task dossier, its two sources must be rechecked at
their permalinks and the task design must pass the offline admission checklist
in [fixture-selection.md](fixture-selection.md).

| Slot | Public cases reviewed | Abstracted product scenario | Source boundary |
| --- | --- | --- | --- |
| D1: asynchronous dependency orchestration | [Next.js #87534](https://github.com/vercel/next.js/issues/87534), [MergeFi frontend #8](https://github.com/MergeFi/frontend/issues/8) | A workspace landing page needs a member profile, its permitted projects, and independent counters. The task can distinguish work that must wait for the profile from work that may begin immediately. | Do not copy the reproduction or suggested `Promise.all`/cache fix. The public task describes only resource dependencies and observable loading rules. |
| D2: request-scope deduplication | [SWR #3013](https://github.com/vercel/swr/issues/3013), [SWR #4282](https://github.com/vercel/swr/pull/4282) | Several widgets ask for the same account summary during one request. They must share an in-flight result while failures and later requests remain independent. | Do not copy SWR API names, promise instrumentation, or implementation. The evaluator counts repository calls and verifies error isolation. |
| D3: derived state and stable identity | [TanStack Query #6840](https://github.com/TanStack/query/issues/6840), [TanStack Query #9618](https://github.com/TanStack/query/pull/9618) | A filtered incident board derives row views from query results, selection state, and a filter. Unchanged rows and callbacks must retain identity without stale selections. | Do not copy `useQueries`, `combine`, or the patch. The task exposes a plain TypeScript model and checks observable identities. |
| D4: global listener ownership | [Vonage video React app #586](https://github.com/Vonage/vonage-video-react-app/issues/586), [OpenCode #34617](https://github.com/anomalyco/opencode/issues/34617) | Multiple screen instances subscribe to one browser-level connection indicator. Listener ownership must survive remounts and release exactly once when the last subscriber leaves. | Do not copy event names, component paths, or cleanup code. The private probe counts subscriptions and releases under remounting. |
| D5: storage read-through caching | [Zustand #3367](https://github.com/pmndrs/zustand/pull/3367), [Zustand #938](https://github.com/pmndrs/zustand/issues/938) | A preference panel reads a persisted setting during hydration and reacts to valid cross-tab changes. It must avoid repeated reads while preserving SSR-safe and malformed-value behavior. | Do not copy middleware APIs or hydration recipes. The evaluator uses a fake storage implementation and deterministic read counters. |
| D6: conditional loading boundary | [Next.js #18819](https://github.com/vercel/next.js/issues/18819), [Next.js #89252](https://github.com/vercel/next.js/issues/89252) | An optional export tool is needed only for authorised users who open a report. Its loader must not initialise for users and routes that cannot use it. | Do not copy dynamic-import syntax, build configuration, or route names. The evaluator observes module-loader calls rather than bundle size or wall-clock time. |
| C1: external event and data validity | [MergeFi backend #28](https://github.com/MergeFi/backend/issues/28), [Fairmint OCP SDK #438](https://github.com/Fairmint/ocp-canton-sdk/pull/438) | A notification feed accepts externally produced events. Invalid envelopes must be rejected without mutating state, while valid events preserve ordering and identifier constraints. | Do not copy webhook schemas, generated types, or validation libraries. The task uses an original small event contract and adversarial inputs. |
| C2: authorisation and public-data boundary | [Directus #12581](https://github.com/directus/directus/issues/12581), [Precogly #227](https://github.com/precogly/precogly/issues/227) | A public project view may expose an approved summary, but its internal notes and items from another organisation must never be returned or counted for an unauthorised viewer. | Do not copy permission queries, vulnerability details, data models, or fixes. The evaluator uses an invented dataset and checks returned data plus aggregate leakage. |
| C3: domain transition and error propagation | [XState #5463](https://github.com/statelyai/xstate/pull/5463), [XState #3279](https://github.com/statelyai/xstate/issues/3279) | An order workflow has terminal states and an asynchronous fulfilment step. Invalid transitions remain terminal, and a rejected fulfilment must enter the defined error state without losing the cause. | Do not copy state-machine names, SCXML semantics, callback APIs, or fixes. The task uses a small original domain transition table and controlled failures. |

## Screening result

All nine rows have two readable, public GitHub permalinks and a mechanism that
can be recreated in Bun/TypeScript without an external service. None has yet
been admitted as a fixture: the next required artefact is a per-slot design
dossier that states two business invariants, an error path, and a deterministic
dynamic probe. A row is rejected if that dossier would reveal a source patch or
skill-rule terminology in its public task.
