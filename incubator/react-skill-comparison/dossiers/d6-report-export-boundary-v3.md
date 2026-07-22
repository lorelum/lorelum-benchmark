# D6 — report export boundary v3

**Status:** candidate, offline design only
**Proposed task:** `report-export-boundary/v3`
**Relevance target:** direct

## Retirement finding

`report-export-boundary/v2` is not a valid basis for a new pilot. Its public
contract scopes concurrent sharing to one controller, while its evaluator
creates two controllers and requires them to share a module-global in-flight
loader keyed only by report ID. That can mix distinct injected loaders and
contradicts the stated ownership boundary. Preserve v2 unchanged as historical
evidence; do not repair it in place.

## Admission evidence and boundary

- Public cases: [Next.js #18819](https://github.com/vercel/next.js/issues/18819)
  and [Next.js #89252](https://github.com/vercel/next.js/issues/89252).
- Product abstraction: an authorised report screen can explicitly open CSV or
  PDF export. Its normal summary remains available to every viewer.
- The public task text names no rule, module system, or import primitive. Its
  public task card may declare only `bundle-conditional.md` for verified G1
  context delivery.

## Public product contract

`createReportController` receives one viewer, report, feature policy, and an
injectable export renderer loader. `summary()` never loads a renderer. An
`openExport(format)` request is eligible only when the viewer is authenticated
and permitted, the report enables exports, the feature policy enables that
format, and the caller explicitly opens it. Every ineligible path returns the
safe declared result without calling a loader.

For one controller, concurrent eligible opens for the same format share one
in-flight loader result; different formats never share a renderer. A fulfilled
or rejected load is evicted before a later open, so errors retain identity and
the next eligible open retries. No renderer state is shared with another
controller, even for the same report identifier.

## Private evaluator design

### Semantic hard gates

- Summary and all four ineligible branches call no loader and expose no export
  result.
- Eligible CSV and PDF calls pass the requested format to their own renderer.
- Loader and renderer errors retain original identity; later eligible calls
  retry.
- Separate controllers never share a loader result.

### Deterministic quality score

| Probe | Points | Observable |
| --- | ---: | --- |
| conditional boundary | 40 | zero loader calls across summary and every ineligible branch |
| same-format in-flight sharing | 35 | one deferred loader call for concurrent eligible opens of one format |
| format and controller isolation | 25 | independent calls for distinct formats and controller instances |

All probes use loader and renderer counters plus deferred promises. No
wall-clock, bundle byte, rule-name, or trace-content assertion determines the
score.

## Required mutation resistance

- eager load during controller construction or `summary()`;
- authorisation or feature checks after loader invocation;
- one sticky fulfilled/rejected renderer retained across later opens;
- one global map shared across controller instances;
- one map key that merges CSV and PDF; and
- wrapped loader or renderer errors.

## Offline admission gate

1. Reference passes twice with a 100 score; starter fails a dynamic check.
2. At least four independent mutations are rejected twice.
3. The public declaration is covered by `bundle-conditional.md` without using
   private audit information to select it.
4. Snapshot, suite entry, coverage mapping, and `test:fixtures`,
   `calibrate:rules`, `validate`, and `test:contracts` all pass before pilot.
5. The first paired API smoke is diagnostic only. If both conditions score 100,
   retire this revision for ceiling effect instead of spending repeat budget.
