# Report insights conditional client module loading

**Status:** pre-registered; implementation intentionally deferred

## Public sources

- https://github.com/vercel/next.js/issues/61066
- https://github.com/vercel/next.js/issues/69865

The report domain and all eventual task material will be original. The links
are external-validity sources only; neither source patch nor its solution is
copied into a benchmark task.

## Domain abstraction and fixed mapping

An authorized member may explicitly open a heavy insights visualization from a
report. A member who is unauthorized, or who does not open it, must not load
that module. The task's sole quality attribution is `bundle-conditional.md`.

The private evaluator will inspect a production build's route chunks and a
browser interaction trace. It will check the initial route, authorized click,
unauthorized route and unclicked route. The loader belongs to the report route
controller only: no cross-controller cache is part of this task.

The public issue will state those observable product requirements without
describing dynamic import or any bundling solution.
