# KOMKED Agent — GitHub Starter Kit

This repository starter captures the requirements and initial project structure discussed for a new KOMKED team operations agent. It is documentation and planning scaffolding; it does not contain a production implementation.

## Documents

- `PRD.md` — product goals, scope, requirements, and open decisions
- `ARCHITECTURE.md` — proposed system shape and technology options
- `DATABASE.md` — initial data model outline
- `WORKFLOWS.md` — receipt, task, communication, and operations flows
- `SECURITY.md` — roles, access boundaries, privacy, and operational controls
- `DESIGN.md` — web-first UX and configurable admin surfaces
- `ROADMAP.md` — phased implementation plan
- `TEST_PLAN.md` — verification checklist for later implementation
- `AGENTS.md` — working rules for coding agents

## Current project decisions

- Build a completely new project.
- Start with a web app; keep mobile expansion possible.
- Use a cloud database as the primary store.
- Include all seven P0 modules: Communication, Briefing, Finance, Calendar, Tasks, Analytics, and CRM.
- Prefer existing subscriptions and free alternatives where they meet requirements.
- GitHub, Vercel, and Stitch may be used during development; final implementation choices require technical validation.

## Proposed stack (not yet approved)

The earlier draft proposed Next.js/TypeScript, Vercel, Supabase PostgreSQL, Google APIs, and a small Python service on the Intel i9 iMac with SQLite/launchd for local tasks. Treat this as a proposal to validate, not a locked decision. See `ARCHITECTURE.md`.

## Getting started

1. Create a private GitHub repository for the project.
2. Upload the files in this folder, preserving their names.
3. Review the open decisions in `PRD.md` and `ROADMAP.md` with the team.
4. Do not put credentials, personal records, receipt images, or production data in Git.
5. After architecture approval, add application code and environment variable templates.

## Status

Requirements summarized from conversation as of 2026-11-25. Items marked `TBD` need team confirmation before production implementation.
