# Pilot fixture design dossiers

These dossiers are design artefacts, not task revisions. A dossier may become
a `pilot` task only after its reference, starter, evaluator, three rejected
mutations, and snapshot satisfy the offline calibration checklist.

| Slot | Proposed slug | Relevance | Deterministic quality signal |
| --- | --- | --- | --- |
| D1 | `member-hub-loader/v2` | direct | controlled dependency-graph start trace |
| D2 | `account-summary-react-cache/v1` | direct | real React server-render cache scope and repository counters |
| D3 | `incident-board-view-model` | direct | object/callback identity and recomputation counters |
| D4 | `connection-indicator-subscriptions` | direct | global listener and release counters |
| D5 | `preference-hydration-store` | direct | storage read and notification counters |
| D6 | `report-export-boundary` | direct | optional module-loader call count |
| C1 | `delivery-notification-ingest` | control | invalid-event mutation and order trace |
| C2 | `project-summary-access` | control | returned-field and aggregate leakage checks |
| C3 | `fulfilment-transition-service` | control | transition and causal-error trace |

The public prompt for every future task must describe interfaces and product
constraints only. It must not mention a source case, a rule name, a framework
helper, a cache primitive, or an implementation tactic from these dossiers.

The historical D1 `member-hub-loader/v1` and D2
`account-summary-request-cache/v1` dossiers remain available as audit evidence.
Neither defines the next formal direct-task candidate.
