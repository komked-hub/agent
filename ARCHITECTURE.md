# Architecture — Initial Proposal

**Status:** Proposal only; technical validation required.

## Principles

- Cloud database is the system of record for structured application data.
- Keep original receipts in Google Drive and maintain references and permissions.
- Separate browser UI, server-side application logic, integration workers, and external services.
- Treat AI/OCR as an assistive extraction step with review for low-confidence or sensitive data.
- Make retries idempotent and auditable.
- Keep secrets outside source control.

## Candidate components

| Layer | Candidate | Status |
|---|---|---|
| Web app | Next.js + TypeScript | Proposed |
| Hosting | Vercel | Proposed |
| Primary DB | Supabase PostgreSQL | Proposed; validate security, region, and backup requirements |
| Auth | Supabase Auth or equivalent | TBD |
| File originals | Google Drive | User requirement for receipts; integration details TBD |
| OCR / AI | Provider and processing route TBD | Must follow data-type policy |
| Local worker | Python on Intel i9 iMac; launchd for startup | Proposed only if local-only integrations require it |
| Local queue/cache | SQLite | Proposed only for local worker resilience |
| Design support | Stitch | Candidate authoring tool |
| Source control | Private GitHub repository | Candidate/expected delivery route |

## Logical flow

1. A user submits a receipt or operational item through an approved intake channel.
2. The app records the source, uploader, timestamp, and access policy.
3. Receipt originals are stored in Drive; the app stores the authorized file reference.
4. OCR/AI extracts candidate fields under the configured data-type policy.
5. Validation checks required fields, duplicates, and confidence; uncertain items enter a review queue.
6. An authorized reviewer corrects or approves the data.
7. Approved structured data is transferred to the selected accounting system.
8. Each stage emits audit and job status records; transient failures can retry safely.

## Trust boundaries

- Browser to application API
- Application API to database
- Application to Google Drive / Google Workspace
- Application to OCR/AI provider
- Application to accounting system
- Optional cloud service to local iMac worker

Each boundary needs explicit authentication, scoped permissions, secret rotation, error handling, and logging rules. Do not log receipt contents or sensitive personal data by default.

## Architecture decisions required

- Confirm hosting and database region/data processing terms.
- Decide whether the iMac worker is truly required; avoid making routine user access depend on a desktop machine unless necessary.
- Select queue/scheduler and define retry, deduplication, and idempotency strategy.
- Select authentication, session, MFA, and password reset behavior.
- Choose OCR/AI provider per data class and retention policy.
- Confirm accounting system API or import format.
- Define observability and backup/restore process.
