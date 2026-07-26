# Workspace profiles should reuse recent server reads

Workspace profile pages now receive repeated sequential visits as members move
between workspaces. Keep the current profile content and missing-workspace
behavior, but reuse successful recent profile reads across requests.

The cache must remain bounded to the two most recently used workspace profiles.
Accessing a cached profile makes it recent. Different workspaces must never
share profile data, including when their reads overlap, and a failed profile
read must not be retained.

Do not change dependencies, project configuration, repository behavior, route
access checks, or other application files. Edit only the supplied profile server
runtime.
