# Defer the command palette from the project shell

Every project route renders the shell, but the command palette is only used
after a user opens it. Loading the shell currently evaluates the command index
even when no user opens the palette.

Update `src/project-shell.ts` so the shell stays lightweight until the palette
is explicitly opened. Preserve `openCommandPalette()` and the commands it
returns. Do not change `src/command-index.ts` or add dependencies.
