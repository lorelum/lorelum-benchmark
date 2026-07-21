# Build a report export controller

Implement `createReportController`. All viewers receive the declared report
summary. Export opens only for a viewer with export permission and a report that
allows exports; an ineligible request must not invoke the renderer loader.

Treat the renderer as a conditional bundle module: load it only when an eligible
export is opened. Concurrent eligible export requests for the same report must
cache one in-flight renderer loader function result and share it. Once that load
settles, a later request loads again. Preserve the original loader error and
allow a later request to retry. Do not add dependencies or change exported
interfaces.
