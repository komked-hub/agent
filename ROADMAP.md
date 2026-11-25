# Roadmap

This roadmap is a sequencing proposal, not a schedule commitment.

## Phase 0 — Confirm requirements

- Confirm accounting system, Google Workspace ownership, KakaoTalk route, and data owners.
- Define role/permission matrix and retention/AI processing by data type.
- Validate proposed hosting, database, OCR/AI, queue, and local worker architecture.
- Define P0 module acceptance criteria and success measures.

## Phase 1 — Secure foundation

- Set up private GitHub repository and deployment environments.
- Implement authentication, role checks, audit events, secrets management, backup and restore.
- Establish shared design system and admin configuration approach.

## Phase 2 — P0 modules

Build all seven required modules in a coherent first release:
1. Communication
2. Briefing
3. Finance
4. Calendar
5. Tasks
6. Analytics
7. CRM

Finance should include receipt intake, OCR review, configurable filename/folder rules, duplicate/missing checks, and approved accounting handoff.

## Phase 3 — Reliability and integrations

- Add bounded retries, manual rerun, outage alerts, idempotent resume, and emergency stop.
- Validate daily backup and restoration.
- Add approved Google/KakaoTalk/accounting integrations.

## Phase 4 — Mobile expansion

- Add mobile application or targeted mobile features after the web app and workflows are stable.

## Release gates

- Role and record-level access tests pass.
- Sensitive data processing and retention are configured and reviewed.
- Backup restore has been demonstrated.
- Integration failure and recovery scenarios are verified.
- No shared default credentials or secrets are present.
