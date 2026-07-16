# Avoid preparing a hidden billing dialog

The billing dialog performs expensive setup. Most renders of the billing page
leave that dialog closed, but the current view prepares it before the user asks
to open it.

Update `src/billing-view.ts` so closed renders do not prepare the dialog. The
dialog must still render correctly after it is opened, and repeated open renders
should continue using the same prepared dialog. Do not change the public types
or add dependencies.
