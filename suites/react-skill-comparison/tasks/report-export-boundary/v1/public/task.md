# Build a report export controller

Implement `createReportController`. All viewers receive the declared report
summary. Export opens only for a viewer with export permission and a report that
allows exports. The renderer is supplied by an injectable loader. Preserve the
original loader error and do not add dependencies.
