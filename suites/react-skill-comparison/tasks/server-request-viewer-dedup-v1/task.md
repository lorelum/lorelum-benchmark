# Share viewer data within one server-rendered dashboard

The dashboard header and navigation both need the current viewer. They render
as parts of the same server request, but the current loader asks the viewer API
twice. A new request must still resolve its own viewer data.

Update `src/dashboard-loader.ts` so one dashboard load shares the viewer lookup
between its header and navigation work, while separate loaders stay isolated.
Preserve the exported interfaces and response shape. Do not add dependencies.
