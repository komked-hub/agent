# KOMKED Agent — GitHub Starter Kit

This repository captures the original requirements and project structure for the KOMKED team operations agent. The current team operations web app is in [apps/ops-hub](apps/ops-hub).

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

## Team operations web app

Run `npm ci` and `npm run build -- --vercel` from `apps/ops-hub`. See the [Vercel deployment guide](apps/ops-hub/VERCEL_DEPLOY.md) for the Git integration and runtime settings.

## Status

The requirements documents record the original decisions and open questions from 2026-11-25. The web app has a Vercel deployment. Team sign-in and live data access depend on the runtime settings in the deployment guide.
