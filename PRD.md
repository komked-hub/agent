# Product Requirements Document — KOMKED Agent

**Status:** Draft from discovery conversation  
**Date:** 2026-11-25  
**Project:** New KOMKED team operations and assistant platform

## 1. Product summary

Build a private, web-first platform that helps KOMKED manage team communication and operational information in one place. It should connect appropriate existing services, provide a shared dashboard, automate repetitive tasks, and preserve human review for sensitive or uncertain data. A mobile app may follow after the web experience is stable.

The product is a new project. It is not an extension of the existing `cycs-agent` repository unless the team later chooses that direction.

## 2. Goals

- Give authorized team members a single authenticated web entry point.
- Bring together the seven P0 work areas: Communication, Briefing, Finance, Calendar, Tasks, Analytics, and CRM.
- Reduce manual receipt transcription and routine coordination.
- Keep sensitive records visible only to assigned users and authorized administrators.
- Provide reliable retries, recovery, auditability, and backups.
- Make operational configuration manageable by an administrator without requiring code changes for every routine adjustment.

## 3. User groups and roles

The system must support these role types:

1. **Super administrator** — organization-wide configuration and access.
2. **Administrator** — delegated administrative operations.
3. **Team member** — permitted work and records.
4. **Read-only user** — view-only access to permitted records.
5. **Task-specific role** — access limited to assigned work or data domain.

Exact permissions for each module and whether multiple roles can be combined are `TBD`. Sensitive counseling records and individual donor/support records must be restricted to the relevant assignee and authorized administrators.

## 4. Scope and priority

### P0 modules

All seven are in the initial product scope:

- **Communication** — team notices and communication workflows; channels and automation boundaries are `TBD`.
- **Briefing** — concise operational summaries and scheduled updates; sources and cadence are `TBD`.
- **Finance** — receipt intake, OCR extraction, review, file organization, and accounting-system handoff.
- **Calendar** — shared event visibility and coordination; provider integration is `TBD`.
- **Tasks** — assignment, status, due dates, and work summaries; detailed workflow is `TBD`.
- **Analytics** — operational metrics and reporting; exact indicators and source systems are `TBD`.
- **CRM** — contact/supporter records with strict access controls; exact fields and workflows are `TBD`.

### Later scope

- Mobile application after the web app.
- Additional integrations and advanced automation after access, retention, and reliability rules are validated.

## 5. Finance and receipt requirements

### Intake sources

The finance workflow should accept:

- KakaoTalk receipt/photo submission
- In-app mobile camera capture
- PDF and electronic receipts
- Google Drive files
- Web upload

The exact KakaoTalk integration method and permitted account/channel are `TBD`.

### OCR and extracted fields

The extraction pipeline should support these fields:

- Payment date and time
- Merchant name
- Total amount
- Tax and supply amount
- Payment method
- Purchased items and quantities
- Business registration number
- Payer
- Project
- Expense purpose

Fields should be configurable so the team can adapt the schema and required-field rules. OCR output is a proposal until reviewed; low-confidence or missing values must be surfaced for human correction rather than silently guessed.

### Storage and handoff

- Keep the original receipt in Google Drive, subject to access and retention policy.
- Store structured extracted data in the existing accounting system; the product must confirm the target system and API/import method before implementation.
- Track Drive and accounting-system references in the application without duplicating credentials or exposing private files.

### Duplicate, missing, and error handling

- Detect likely duplicate receipts and send them to review.
- Flag missing required values.
- Make OCR or integration failures visible and retryable.
- Preserve original source files and extraction history.
- Provide an authorized manual correction path.

### Filename configuration

Filename parts must be independently configurable. The initial fields are:

1. 결제일 (payment date)
2. 상호명 (merchant name)
3. 금액 (amount)
4. 결제자 (payer)

An administrator must be able to edit, remove, and reorder each part separately. A missing field must follow a configurable fallback rule or be flagged for review; the agent must not invent a value. Exact separators, date/amount formatting, fallback text, and collision handling are `TBD`.

### Folder rules

Receipt destination folders and classification rules should be configurable. Folder hierarchy and naming conventions are `TBD`.

## 6. Admin configurability

- Provide an administrator editing surface for page composition and configuration.
- Page components should be editable and removable by an authorized administrator.
- Filename components should be independently editable, removable, and reorderable.
- Administrative actions must be permission-checked and audit-logged.
- Clarify which structures are editable content versus fixed application navigation before implementation.

## 7. Authentication and privacy

- Use KOMKED-specific ID/password login.
- Enforce role-based and task-specific permissions server-side.
- Restrict counseling records and individual donor/support histories to the assigned worker and authorized administrators.
- Configure AI processing and retention by data type.
- Do not use real personal data in development fixtures or public repositories.

An `admin/admin` initial login was requested during discovery. Treat this only as a local development bootstrap request; never ship a shared default password to production. Production bootstrap must use a secure one-time setup or administrator invitation and require credential rotation.

## 8. Reliability and operations

- Back up data daily.
- Notify administrators of service failures.
- Allow authorized manual reruns of failed work.
- Retry transient connection errors automatically with bounded retry behavior.
- Resume incomplete work after internet recovery where safe and idempotent.
- Start required local components automatically after iMac restart if a local worker is adopted.
- Provide an emergency stop for automation that could cause repeated or unintended actions.
- Record audit events for sensitive access and administrative changes.
- Define recovery time and recovery point targets before production (`TBD`).

## 9. Platform and constraints

- New project, web app first, mobile expansion later.
- Cloud database is the primary data store.
- The Intel i9 iMac with 16 GB memory and 1 TB storage is available as an operational machine, but its role must be validated.
- GitHub, Vercel, and Stitch are available candidate tools.
- Prefer already-paid services and free alternatives when they satisfy privacy, reliability, and operational needs.
- Select ChatGPT/Codex usage and runtime architecture after technical validation.

## 10. Success measures (to define)

Candidate measures: receipt processing time, OCR correction rate, duplicate detection quality, task completion visibility, automation failure recovery, and access-control correctness. Targets and measurement methods are `TBD`.

## 11. Open decisions

- Confirm organization identity/name to display in product and repository.
- Confirm accounting system and its integration method.
- Confirm Google Workspace account/Drive ownership and permission model.
- Confirm KakaoTalk channel and supported integration route.
- Define detailed role matrix and record-level access rules.
- Define retention periods by data type and AI-processing permissions.
- Confirm the seven modules' detailed workflows and launch acceptance criteria.
- Approve or replace the proposed architecture and hosting model.
- Define backup retention, recovery objectives, alert recipients, and emergency-stop behavior.
- Decide whether the local iMac worker is needed and what tasks it may run.
- Set receipt filename formatting, folder tree, missing-value policy, and duplicate naming behavior.
