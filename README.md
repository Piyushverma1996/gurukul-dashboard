# Gurukul FC Dashboard

Private staff dashboard for Gurukul Football Academy. Built with Next.js 16 · Drizzle (MySQL/MariaDB) · Better Auth.

- Spec: `docs/superpowers/specs/2026-09-12-gurukul-dashboard-design.md`
- Plans: `docs/superpowers/plans/`
- Deploy: `docs/deploy/hostinger-runbook.md`

## Local development (Windows/macOS/Linux, Node 22+)
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

## Tests
```bash
npm run test:unit
npm run test:int      # starts a throwaway MySQL 8.4 automatically
npm run test:e2e      # Playwright, phone-sized viewport
```
