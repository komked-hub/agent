# UX and Design Outline

## Product surfaces

- **Web app:** primary experience for launch.
- **Mobile:** later expansion; initial web must remain responsive enough for phone receipt capture if that is approved.
- **Admin edit page:** authorized users can configure supported page components and finance filename rules.

## Navigation

P0 modules to represent: Communication, Briefing, Finance, Calendar, Tasks, Analytics, and CRM. Final navigation labels, landing page, and role-based visibility are `TBD`.

## Finance experience

- Receipt inbox with source, submitter, received time, review state, and exception indicators.
- Receipt review view showing original file and extracted candidate values together.
- Clear distinction between OCR suggestion and approved data.
- Mark low-confidence/missing fields and likely duplicates for human review.
- Filename-rule editor with independent field rows, drag/reorder controls, edit/remove actions, and live preview.
- Folder-rule settings with validation and an example destination preview.

## Admin configurability

- Page-component editor supports editing/removing supported components.
- Show unsaved changes and preview before applying.
- Confirm destructive removal and record who changed configuration.
- Enforce admin role on the server.

## Accessibility and responsive behavior

Use keyboard-accessible controls, readable contrast, clear error messages, and responsive layouts. Confirm the design system and localization strategy before implementation.
