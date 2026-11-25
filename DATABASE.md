# Database — Initial Data Model Outline

This is a conceptual starting point. Exact columns, constraints, and migrations must follow approved workflows and the selected database.

## Candidate entities

- `users` — account identity, status, timestamps; authentication secrets belong to the auth provider.
- `roles` — named roles: super admin, admin, team member, read-only, task-specific.
- `user_role_assignments` — role membership and optional scope.
- `permissions` — actions by module/resource.
- `projects` — organizational projects used for task and expense classification.
- `receipts` — uploader, source, status, payment date/time, merchant, totals, tax/supply values, method, business number, payer, project, purpose, confidence, review state.
- `receipt_line_items` — item, quantity, unit/line values where available.
- `receipt_files` — Drive file reference, original filename, MIME type, checksum, retention class; no public URL or secret token.
- `receipt_extractions` — OCR provider/model/version, extracted candidate payload, confidence and review metadata; retention must follow policy.
- `filename_rules` — ordered, independently configurable fields, formatting, separators, fallback rules, enabled state.
- `folder_rules` — configurable Drive destination/classification rules.
- `integration_connections` — provider metadata and status; secret material stored in a managed secret store, not ordinary DB fields.
- `jobs` — queue state, attempts, idempotency key, retry schedule, error classification, timestamps.
- `audit_events` — actor, action, target, timestamp, outcome, minimal metadata.
- `page_layouts` / `page_components` — configurable page content and enabled/order settings, if validated as a product requirement.
- `tasks`, `calendar_events`, `communications`, `briefings`, `analytics_snapshots`, `contacts` — candidate domain records for the remaining P0 modules; schemas TBD.

## Data rules

- Use stable IDs and explicit created/updated timestamps.
- Store money as integer minor units with currency code, after deciding supported currency behavior.
- Keep source and reviewer provenance for extracted fields.
- Separate access scope from UI visibility.
- Apply retention by data type; deletion must include derived copies and integration references where required.
- Design row-level policies or equivalent authorization for sensitive domains.
- Audit access to especially sensitive records while avoiding unnecessary copies of their contents in logs.

## Open schema questions

- Which accounting system is authoritative for final expense records?
- Are expenses reimbursable, card-based, project-funded, or all of these?
- What currency and tax rules apply?
- What record-level scopes map to task assignments?
- What retention periods apply to receipts, donor records, counseling records, and AI extraction data?
