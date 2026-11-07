# FeeDesk (working name) — v1 Spec

Multi-institution SaaS for student fee collection in India (schools, colleges, coaching/training institutes).

## Stack
- Frontend: React (Vite), React Router, TanStack Query, component lib (MUI or shadcn/ui)
- Backend: Node.js + Express (REST, JSON)
- DB: SQLite for dev/testing, PostgreSQL for production
- ORM: Prisma (one schema, provider switch sqlite -> postgresql) [proposed, awaiting OK]
- Language: TypeScript [proposed, awaiting OK]
- PDFs: receipts via server-side PDF generation (pdfkit or puppeteer)

## Tenancy (revised for Postgres move)
- Single database, shared schema, every tenant table has `institution_id`
- All queries scoped by institution via middleware/repository layer; Postgres Row Level Security added in production
- Institution identified by subdomain/code (e.g. dav-bbsr.app.in)

## Payments
- Online: each institution connects its OWN gateway account (Razorpay first; Cashfree/PayU later). Keys encrypted at rest (AES-256-GCM, key from env).
- Flow: create gateway order -> parent pays -> webhook verified (signature) -> payment + allocation + receipt. Webhook is source of truth; idempotent by gateway payment id.
- Counter: cash, cheque/DD (received -> cleared/bounced), UPI at counter, NEFT/bank transfer, card swipe.
- Optional convenience fee on online payments (per institution).
- Daily reconciliation report.

## Roles
- Platform: super_admin, support
- Institution: admin, accountant, cashier
- Parent/student portal (v1): login by phone OTP or admission no + DOB; view dues, pay online, download receipts

## Modules (v1)
1. Platform: institution onboarding, plans, institution status
2. Institution setup: academic years, units (class/course/batch), sections, fee heads, GST toggle per head
3. Students & guardians: CRUD, Excel/CSV bulk import, promote to next year
4. Fee structures: head-wise amounts per unit, frequency (one-time/monthly/quarterly/term/semester/installment), due dates
5. Concessions: % or flat, per head, sibling/staff/merit/scholarship/RTE/custom
6. Late fine rules: per day, flat after due, slab; admin waiver with reason
7. Demand generation: fee_demands per student per head per period
8. Collection: counter + online; partial and advance payments; allocation oldest-due-first
9. Receipts: numbered per institution per financial year (Apr-Mar), PDF, amount in words, UPI QR on fee slip; cancel with reason (never delete)
10. Refunds & adjustments
11. Reports: daily collection, mode-wise, head-wise, class-wise outstanding, defaulters, cashier day-close, reconciliation
12. Audit log on every create/edit/cancel/waiver

## Later (v2+)
SMS (DLT templates)/WhatsApp/email reminders, Razorpay Route + platform fee, 80C tuition fee certificate, multi-branch, analytics, regional languages, SaaS subscription billing.

## Conventions
- Money: integer paise everywhere
- Dates stored UTC, displayed IST
- INR formatting in lakh/crore style

## Core tables
platform: institutions, plans, platform_users
tenant (all with institution_id): academic_years, units, sections, students, guardians, fee_heads, fee_structures, fee_structure_items, concessions, student_concessions, late_fine_rules, fee_demands, payments, payment_allocations, receipts, receipt_counters, refunds, gateway_configs, gateway_orders, webhook_events, users, audit_log
