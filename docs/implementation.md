# Academy Ops Hub Implementation

## MVP Scope

- Auth: Supabase Auth, profile role, MFA flag.
- Requests: equipment, A/S, parts, Subly publishing, NAS.
- Workflow: received -> reviewing -> approval pending -> in progress -> completed.
- Security: RBAC, RLS, audit logs, NAS permission separation.
- AI Harness: router, builder, reviewer, auditor states represented in UI and logs.

## Local Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## Supabase Setup

1. Create Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Run `supabase/migrations/001_academy_ops_hub.sql` in SQL editor or Supabase CLI.

## Current App Behavior

- Role selector simulates RBAC.
- Request queue supports search, status filter, selection, approval, hold, and creation.
- A/S panel classifies symptoms with deterministic FAQ-style rules.
- NAS panel creates a prefilled NAS permission request.
- Audit log records user and AI workflow events locally.

## Next Backend Hook Points

- Replace local request state in `components/ops-console.tsx` with Supabase queries.
- Use `ops_requests`, `approvals`, `audit_logs`, `nas_permissions`, and `as_faqs`.
- Move approval mutations into server actions or Edge Functions.
