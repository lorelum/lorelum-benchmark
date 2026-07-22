# Issue: workspace dashboard repeats work during navigation

Opening a workspace with several projects sometimes feels slower than the
amount of data suggests. The overview, quota and recent-project sections must
continue to show the current seeded values, including an empty workspace. A
missing workspace must still surface the repository error and access checks
must remain in force.

Please reduce avoidable server work on this route without changing its visible
content, data policy, dependencies or project configuration. You may change
only the dashboard server implementation and its directly related server
components.
