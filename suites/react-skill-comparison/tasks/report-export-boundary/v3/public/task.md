# Build a report export controller

Implement `createReportController`. A CSV or PDF export opens only when the
viewer is authenticated and permitted, the report allows exports, the policy
enables that format, and the caller explicitly opens it. `summary()` and every
ineligible request must not call a renderer loader. Concurrent eligible opens
of one format share an in-flight load within one controller; formats and
controller instances never share. Settled loads retry later and preserve
original errors. Do not add dependencies or change exported interfaces.
