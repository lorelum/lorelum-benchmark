---
name: accessible-empty-state-copy
description: Make empty product states understandable and actionable for every user.
metadata:
  version: v1
  source: matched-irrelevant-control
---

# Write accessible empty-state copy before a user can act

## Intent

Treat an empty state as a complete user-facing moment, not a missing implementation
detail. A successful state tells a person what happened, why it matters, and what they
can do next without relying on decorative imagery or hidden context.

## Apply when

- Designing a list, search result, dashboard, or settings screen with an empty outcome.
- Replacing an ambiguous blank panel, spinner, or generic error sentence.
- Writing product text that must remain understandable for assistive technology users.

## Procedure

1. Name the current state in a short heading that a person can understand out of context.
2. Explain the immediate reason in plain language, separating no-content, no-match, and no-access states.
3. Offer one primary next action when one exists; make its label describe the outcome rather than the control itself.
4. Keep supporting text concise, visible, and associated with the heading and action.
5. Preserve a predictable focus destination when the state replaces interactive content.
6. Review the text at narrow widths and with a screen reader so that meaning does not depend on layout or imagery.

## Verification

- A person can distinguish an empty collection from an empty search result.
- A person denied access receives an explanation without learning protected details.
- The primary action, if present, describes its effect and can be reached by keyboard.
- The heading and supporting text remain understandable when read in source order.

## Avoid

- Showing a blank card, an unlabeled icon, or a generic “Nothing here” message.
- Using only color, motion, or illustration to communicate the state.
- Labeling an action with a vague verb that hides what will happen.
- Moving keyboard focus to content that is no longer present.
