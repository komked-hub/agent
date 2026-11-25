# Verification Plan — Draft

No implementation exists in this starter kit. Use this checklist when features are built; define test tooling after the stack is approved.

## Authentication and authorization

- Valid and invalid login, password reset, session expiry.
- Each role can access only permitted modules and records.
- Counseling and individual donor/support records are inaccessible to unauthorized users.
- Admin-only configuration endpoints reject unauthorized calls, including direct API requests.

## Receipt workflow

- Each requested input format is accepted or clearly rejected with a useful message.
- OCR values retain provenance and confidence.
- Missing and low-confidence values enter review; no value is invented.
- Duplicate detection flags likely duplicates without silently deleting data.
- Reviewer corrections persist with an audit trail.
- Drive original and accounting-system handoff references are correct.
- Filename fields can be independently edited, removed, reordered, and previewed.
- Folder rules behave as configured; failures remain recoverable.

## Configurable pages

- Authorized admins can edit/remove supported page components.
- Non-admin users cannot change page configuration.
- Invalid layouts are rejected safely and changes are auditable.

## Reliability and privacy

- Transient errors retry within configured limits.
- Idempotent resume does not create duplicate records or send duplicate actions.
- Manual rerun works for authorized users and records its actor.
- Failure notifications reach configured administrators.
- Emergency stop halts the selected automation.
- Daily backup is created and can be restored.
- AI processing and retention follow the per-data-type configuration.
- Logs do not expose secrets or unnecessary sensitive content.

## Release checks

- Production contains no `admin/admin` shared login.
- Repository contains no secrets, receipt images, or personal records.
- Recovery and access-control acceptance criteria have named owners.
