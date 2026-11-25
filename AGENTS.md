# Coding Agent Instructions

## Project context

This is a new KOMKED operations-agent project. The current repository is a requirements and planning starter; do not assume a production implementation exists.

## Working rules

- Read `PRD.md`, `SECURITY.md`, and the relevant workflow/design document before implementing a feature.
- Preserve all seven P0 modules unless the user explicitly reprioritizes them.
- Treat the architecture in `ARCHITECTURE.md` as a proposal until a human approves it.
- Never commit secrets, credentials, real receipt images, personal records, donor data, or counseling data.
- Enforce authorization on the server/API, not only in the UI.
- Do not invent missing receipt values. Mark uncertain OCR fields for human review.
- Keep filename fields independently configurable: payment date, merchant name, amount, and payer. Support editing, removing, and reordering each field.
- Keep page components editable/removable only for authorized administrators, and audit those changes.
- Use idempotency for retries and record job state transitions.
- Follow data-type-specific AI processing and retention settings.
- Mark open requirements as `TBD`; do not make silent product decisions on privacy, access, or external-system ownership.
- Keep changes small and document any new assumption in the relevant design or decision record.

## Before production

- Replace any development bootstrap login with a secure setup flow; never deploy `admin/admin` as a shared credential.
- Validate role boundaries, backup restoration, retry/resume behavior, and emergency stop.
- Obtain approval for integrations, retention, and data-processing settings.
