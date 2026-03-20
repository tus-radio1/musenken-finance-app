# Work Log: DB-Architect

## Summary
Created 4 database migration files for Phase 2 of the production roadmap, implementing soft delete, RLS policies, audit logging, and system configuration.

## Tasks Completed

### Migration 1: Soft Delete Columns (`20260320100000_add_soft_delete_columns.sql`)
- Added `deleted_at TIMESTAMPTZ DEFAULT NULL` to `transactions`, `subsidy_items`, and `profiles`
- Created partial indexes on `deleted_at` for each table (WHERE deleted_at IS NOT NULL) for efficient querying of soft-deleted records

### Migration 2: RLS Policies (`20260320100100_add_rls_policies.sql`)
- Created helper functions `is_admin()` and `has_role(role_name TEXT)` using `SECURITY DEFINER` to safely check roles
- **profiles**: authenticated SELECT all, users UPDATE own, admin ALL
- **transactions**: authenticated SELECT non-deleted, group members INSERT for their group, owners UPDATE own pending, admin/accounting UPDATE any, admin ALL
- **subsidy_items**: authenticated SELECT non-deleted, applicants INSERT own, owners UPDATE own pending/rejected, admin/accounting UPDATE any, admin ALL
- **user_roles**: authenticated SELECT all, admin ALL

### Migration 3: Audit Log (`20260320100200_add_audit_log.sql`)
- Created `audit_logs` table with columns: id, table_name, record_id, action (INSERT/UPDATE/DELETE/SOFT_DELETE), old_data, new_data, changed_by, changed_at
- Created indexes on (table_name, record_id), changed_at, and changed_by
- RLS: admin reads all, users read own changes, users insert own logs, no UPDATE/DELETE allowed

### Migration 4: System Config (`20260320100300_add_system_config.sql`)
- Created `system_config` key-value table
- Seeded `accounting_user_id` with the hardcoded UUID from the codebase
- RLS: authenticated can read, admin can manage

## Files Modified
- `supabase/migrations/20260320100000_add_soft_delete_columns.sql` (new)
- `supabase/migrations/20260320100100_add_rls_policies.sql` (new)
- `supabase/migrations/20260320100200_add_audit_log.sql` (new)
- `supabase/migrations/20260320100300_add_system_config.sql` (new)

## Key Decisions

1. **SECURITY DEFINER on helper functions**: `is_admin()` and `has_role()` use `SECURITY DEFINER` so they can query `user_roles` and `roles` tables even when those tables have RLS enabled, avoiding circular dependency issues.

2. **STABLE function volatility**: Both helper functions are marked `STABLE` since they read from the database but don't modify it, allowing PostgreSQL to optimize repeated calls within a single statement.

3. **Partial indexes for soft delete**: Used `WHERE deleted_at IS NOT NULL` partial indexes instead of full indexes, since the vast majority of records will have `deleted_at IS NULL` -- this keeps the index small and efficient for finding deleted records.

4. **Permissive policy design**: Used overlapping permissive policies (e.g., `transactions_update_own` + `transactions_update_admin_accounting` + `transactions_admin_all`) because PostgreSQL ORs permissive policies together, so any matching policy grants access.

5. **Subsidy insert policy**: Restricted to `applicant_id = auth.uid()` to prevent users from creating subsidies on behalf of others. The accounting system user (which uses admin client / service role) bypasses RLS.

6. **Audit log immutability**: No UPDATE or DELETE policies on audit_logs -- with RLS enabled, the absence of policies means those operations are denied by default.

7. **Added changed_by index on audit_logs**: Added an extra index beyond the spec (`idx_audit_logs_changed_by`) for efficient lookup of a user's own audit entries, which the RLS policy `audit_logs_select_own` queries against.

## Issues Encountered
- No issues. All migrations are idempotent using `IF NOT EXISTS` / `IF EXISTS` where applicable.
- Note: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` handles re-runs of migration 1.
- Note: `CREATE TABLE IF NOT EXISTS` handles re-runs of migrations 3 and 4.
- Note: `CREATE OR REPLACE FUNCTION` handles re-runs of helper functions in migration 2.
- Caveat: `CREATE POLICY` does not support `IF NOT EXISTS` in PostgreSQL. Re-running migration 2 will fail if policies already exist. This is standard behavior for Supabase migrations (run-once).
