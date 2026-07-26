# Report insights load only when requested

The report page is useful before optional insights are opened. Authorized
members may open and close the insights view; its visual code and report data
must be loaded only after the first open, then reused when it is opened again.
Members without report access must not receive the insights experience or its
data. Preserve the existing report content and interaction behavior.

Use the supplied project scripts to check your work. Do not start development
or production servers in the background, and do not leave background processes
running when the task is complete.

The starter's dependency state is fixed by its Bun lockfile. Do not add or
update dependency manifests or alternate package-manager lockfiles.
