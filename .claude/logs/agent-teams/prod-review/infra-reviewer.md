# Work Log: Infrastructure/DB Reviewer

## Summary
Comprehensive review of Supabase database schema, migrations, client configuration, and server actions for production readiness. Found 5 critical, 7 high, 12 medium, and 4 low severity issues across security, data integrity, and infrastructure concerns.

## Findings
- [Critical] middleware.ts — Missing entirely; Supabase SSR auth sessions will not refresh, causing silent auth failures
- [Critical] RLS policies — Only 1 RLS policy exists (fiscal_years SELECT). All other tables (transactions, subsidy_items, profiles, budgets, roles, user_roles, accounting_groups) have no RLS policies
- [Critical] app/actions.ts, app/subsidies/manage/actions.ts — Financial records (transactions, subsidy_items) are hard-deleted; violates financial record-keeping requirements
- [Critical] No audit_log table — No audit trail for any financial mutation (create/update/delete)
- [Critical] All page.tsx and action files — createAdminClient() used pervasively for routine data fetching, bypassing RLS as the default pattern
- [High] Project root — No .env.example file; required environment variables undocumented
- [High] app/ledger/actions.ts + 3 other files — Hardcoded UUID `9701edd2-bd9d-4d57-9dd6-7235686103bf` as special "accounting" user; environment-specific and fragile
- [High] lib/account.ts — Predictable initial passwords derived from student number with no forced password change
- [High] Infrastructure — No backup strategy documented for financial data
- [High] app/members/manage/actions.ts — Profile hard-delete can orphan or cascade-delete financial records
- [High] subsidy_items — No change history for amount modifications (approved_amount, actual_amount)
- [High] app/actions.ts (uploadReceiptAction) — Client-provided fileName not sanitized; path traversal risk
- [Medium] supabase/migrations/ — No initial/base schema migration; cannot recreate DB from migrations alone
- [Medium] supabase/migrations/ — No explicit indexes on frequently queried FK columns (accounting_group_id, applicant_id, fiscal_year_id, user_id, status)
- [Medium] utils/supabase/server.ts — Admin client and user client in same module; increases accidental import risk
- [Medium] next.config.ts — No CSP headers or rate limiting configured
- [Medium] app/subsidies/manage/actions.ts — No self-approval check for subsidy approval (unlike transactions)
- [Medium] Password validation — Inconsistent minimum length (6 in settings, 8 in admin reset)

## Issues Encountered
- Could not read .env.local (permission denied) -- unable to verify actual environment variable contents
- No initial schema migration exists in supabase/migrations/; schema analysis was inferred from queries and incremental migrations only
- No middleware.ts exists at project root (confirmed via glob and file system search)
