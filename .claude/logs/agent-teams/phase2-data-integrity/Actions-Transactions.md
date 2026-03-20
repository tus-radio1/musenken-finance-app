# Work Log: Actions-Transactions

## Summary
Implemented Phase 2 data integrity changes for transaction-related actions: soft delete, audit logging, RLS-aware client usage, and deleted_at query filters across ledger and budget modules.

## Tasks Completed

### Task 1: Created lib/audit-log.ts
- New utility file with `logAuditEvent()` function
- Inserts audit records into `audit_logs` table
- Wrapped in try/catch to never break main operations on audit failure

### Task 2: Modified app/actions.ts
- Imported `logAuditEvent` from `@/lib/audit-log`
- `deleteTransaction`: Converted from physical `.delete()` to soft delete via `.update({ deleted_at })` with `.is('deleted_at', null)` guard
- `deleteTransaction`: Added `SOFT_DELETE` audit log entry with old transaction data
- `deleteTransaction`: Replaced `createAdminClient()` with `createClient()` for all queries (SELECT and soft-delete UPDATE)
- `updateTransaction`: Replaced `createAdminClient()` with `createClient()` for SELECT queries (transactions, profiles, user_roles, fiscal_years) and the UPDATE operation
- `updateTransaction`: Added `UPDATE` audit log entry with old and new data
- `updateTransactionStatus`: Added `.is('deleted_at', null)` filter to transaction SELECT and UPDATE queries
- `updateTransactionStatus`: Added `UPDATE` audit log entry with old and new status data
- `uploadReceiptAction`: Kept `createAdminClient()` for storage upload (documented with comment explaining RLS bypass requirement)

### Task 3: Modified app/ledger/actions.ts
- Replaced `createAdminClient` import with `createClient` (removed admin client entirely)
- Imported `getAccountingUserIdSync` from `@/lib/system-config`
- All queries (`transactions`, `subsidy_items`, `profiles`, `budgets`) now use `supabase` (RLS-aware client)
- Added `.is('deleted_at', null)` filters to transactions, subsidy_items, and profiles queries
- Replaced hardcoded UUID `9701edd2-bd9d-4d57-9dd6-7235686103bf` with `getAccountingUserIdSync()` call

### Task 4: Modified app/ledger/page.tsx and app/budget/page.tsx
- **ledger/page.tsx**: Removed `createAdminClient` import, replaced all `admin` client usage with `supabase` for fiscal_years and profiles queries, added `.is('deleted_at', null)` to profiles query, passed `supabase` to `getUserTeams()` for both client params
- **budget/page.tsx**: Removed `createAdminClient` import, replaced all `adminClient` usage with `supabase` for fiscal_years, accounting_groups, budgets, transactions, and subsidy_items queries. Added `.is('deleted_at', null)` to transactions and subsidy_items queries
- **budget/actions.ts**: Kept `createAdminClient()` for budget and fiscal_year write operations (INSERT/UPDATE) with comments documenting the RLS bypass requirement. SELECT queries already used `createClient()`.

## Files Modified
- `lib/audit-log.ts` (CREATED): Audit logging utility
- `app/actions.ts`: Soft delete, audit logging, createClient migration
- `app/ledger/actions.ts`: createClient migration, deleted_at filters, system-config UUID
- `app/ledger/page.tsx`: createClient migration, deleted_at filters
- `app/budget/page.tsx`: createClient migration, deleted_at filters
- `app/budget/actions.ts`: Added comments documenting why createAdminClient is kept for writes

## Key Decisions
1. **Kept createAdminClient for storage uploads** (uploadReceiptAction): Storage bucket RLS requires service role for uploads
2. **Kept createAdminClient for budget/fiscal_year writes** (budget/actions.ts): These tables likely lack RLS write policies; authorization is handled in application code
3. **profiles queries get deleted_at filter**: Even though profiles table has deleted_at column per schema contract, we filter it in queries to exclude soft-deleted profiles
4. **Audit logging is fire-and-forget**: Wrapped in try/catch, logged to console on failure, never breaks main operation flow

## Issues Encountered
- None. TypeScript compilation passes cleanly (`tsc --noEmit` with zero errors).
