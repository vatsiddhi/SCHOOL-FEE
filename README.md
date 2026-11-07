# FeeDesk — Fee Collection SaaS (India)

Monorepo: `apps/api` (Node + Express + TypeScript + Prisma) and `apps/web` (React + Vite + TypeScript).

## Run locally
```bash
npm install
cd apps/api && cp .env.example .env
npx prisma migrate dev        # creates SQLite dev.db
npx prisma db seed            # demo institution "demo-school"
npm run dev                   # API on :4000
# new terminal
cd apps/web && npm run dev    # web on :5173 (proxies /api)
```
Reset DB: `npx prisma migrate reset`

Demo logins (seeded): platform `admin@feedesk.local / admin123`, institution `accounts@demo.school / demo123`.

## Tenancy
Send `x-institution-code: demo-school` header in dev; subdomain in production.

## Moving to PostgreSQL
1. In `prisma/schema.prisma` set `provider = "postgresql"`
2. Set `DATABASE_URL=postgresql://...`
3. Delete `prisma/migrations`, run `npx prisma migrate dev --name init`

## Conventions
- Money is integer paise everywhere
- Receipt numbers per institution per financial year (Apr–Mar)
- Receipts are cancelled, never deleted; every change goes to audit_log
