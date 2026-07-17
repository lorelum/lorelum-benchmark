# Load an advanced React settings panel on demand

The settings route is part of the initial application shell. Its advanced panel
is only needed after a user explicitly opens it, but the current implementation
loads the advanced panel module during the initial route import.

Update `src/settings.ts` so importing the settings shell does not load the
advanced panel. Preserve the public `openAdvancedPanel()` function and its
return value. The panel must still load and render after `openAdvancedPanel()`
is called.

Do not add dependencies or change the advanced panel module.
