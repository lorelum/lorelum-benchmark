# Keep the global search shortcut scoped to the current page

The project page installs a global shortcut that opens search. Navigating away
and back should not leave inactive pages listening for the same shortcut, or a
single key press can open search more than once.

Update `src/search-shortcut.ts` so the exported installer still opens search
for its shortcut while active, and its cleanup fully removes the listener. Do
not add dependencies or change the exported interfaces.
