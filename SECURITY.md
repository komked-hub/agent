# Security, Privacy, and Operations

## Authentication

- KOMKED-specific ID/password login is required.
- Use a supported identity/authentication provider; never store plaintext passwords.
- Define password reset, session expiry, MFA, and account recovery before launch.
- The requested `admin/admin` combination is permitted only as a temporary local-development bootstrap, if needed. It must not be deployed or shared in production. Production setup must force a unique credential and secure rotation.

## Authorization

- Roles: super administrator, administrator, team member, read-only, and task-specific access.
- Apply authorization on every server-side operation and data query.
- Restrict counseling records and individual donor/support histories to the assigned staff member and authorized administrators.
- Default-deny access where role or assignment is unclear.
- Review access changes and revoke accounts promptly when membership changes.

## Sensitive data and AI

- Configure whether AI may process each data type.
- Configure retention periods independently by data type.
- Keep receipt originals in the approved Drive location and restrict sharing.
- Avoid sending sensitive records to an AI service unless the relevant data policy explicitly allows it.
- Redact/minimize prompts and logs; do not use real personal data in development or tests.

## Secrets and source control

- Never commit API keys, service account files, passwords, access tokens, or production data.
- Use a managed secret store/environment settings, least privilege, and rotation.
- Keep `.env` files out of Git; provide only a sanitized `.env.example` after required variables are known.

## Audit and operations

- Daily automated backups are required.
- Define backup encryption, retention, restore tests, and recovery objectives.
- Notify designated administrators about service failures.
- Provide manual rerun for failed jobs, bounded automatic retries for transient connection failures, and safe resume after internet recovery.
- Make local worker startup after iMac reboot automatic only if the local worker is approved.
- Provide an emergency stop and audit administrative changes and sensitive access.
- Define incident response contacts and escalation steps before production.
