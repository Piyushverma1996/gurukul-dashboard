# Gurukul FC Dashboard

A private staff dashboard for Gurukul Football Academy. It covers students, attendance, monthly fees, cash verification, WhatsApp reminders and a two-way Google Sheet sync.

- **Live:** https://dashboard.gurukulfc.com (login required)
- **Stack:** Next.js 16, Drizzle ORM on MariaDB/MySQL, Better Auth
- **Start here:** [`docs/CONTEXT.md`](docs/CONTEXT.md) covers the full project context: roles, rules, architecture, production setup, operations and roadmap.

| Doc | For |
|---|---|
| [`docs/CONTEXT.md`](docs/CONTEXT.md) | Overview; read first |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) | Design specs (detailed behaviour) |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | Implementation plans |
| [`docs/deploy/hostinger-runbook.md`](docs/deploy/hostinger-runbook.md) | Production setup and operations |

## Local development (Node 22.12+)
```bash
npm install
npm run db:dev        # terminal 1: throwaway MySQL on :3307 with demo data; prints logins
cp .env.example .env.local   # then set DATABASE_URL from the db:dev output and a BETTER_AUTH_SECRET
npm run dev           # terminal 2: http://localhost:3000
```
Demo logins (phone / password):
- admin `99999 00001` / `admin-pass-1`
- head coach `99999 00002` / `coach-pass-1`
- assistant `99999 00003` / `assist-pass-1` (forced to change password)

## Checks
```bash
npm run typecheck
npm run test:unit
npm run test:int      # starts a throwaway MySQL 8.4 automatically
npm run test:e2e      # Playwright, phone-sized viewport
```

## Deploying
Pushing to `main` auto-deploys on Hostinger. Database schema changes need `npm run db:migrate` against production first; see the runbook, §10.

`registers/` holds children's personal data. It's git-ignored, so never commit it.
