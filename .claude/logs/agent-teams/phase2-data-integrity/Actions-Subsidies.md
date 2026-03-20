# Work Log: Actions-Subsidies

## Summary
Implemented Phase 2 data integrity changes across all subsidy-related files: soft delete, audit logging, hardcoded UUID removal, and createAdminClient replacement.

## Tasks Completed

### Task 1: Soft delete in app/subsidies/manage/actions.ts
- Converted `deleteSubsidyItem` from `.delete()` to `.update({ deleted_at })` with `.is('deleted_at', null)` guard
- Converted `updateSubsidyStatus` transaction deletion (when status="unexecuted") from physical delete to soft delete with `.select("id")` to capture affected IDs for audit logging
- Added `logAuditEvent` calls after every soft delete and significant update operation
- Added `.is('deleted_at', null)` filters to all UPDATE queries on subsidy_items

### Task 2: Remove hardcoded UUID from app/subsidies/manage/actions.ts
- Replaced `"9701edd2-bd9d-4d57-9dd6-7235686103bf"` with `getAccountingUserIdSync()` from `@/lib/system-config`
- Added import for `getAccountingUserIdSync`

### Task 3: Remove hardcoded UUID from app/subsidies/manage/client-page.tsx
- Extracted hardcoded UUID into a `ACCOUNTING_USER_ID` constant using `process.env.NEXT_PUBLIC_ACCOUNTING_SYSTEM_USER_ID` with fallback
- Used in both the profile existence check and the augmented profiles array

### Task 4: Replace createAdminClient() in remaining files
- **app/subsidies/manage/actions.ts**: All 4 functions now use `createClient()` (removed `createAdminClient` import entirely)
- **app/subsidies/manage/page.tsx**: Replaced `createAdminClient()` with `await createClient()` for accounting_groups query
- **app/subsidies/page.tsx**: Already used `createClient()`, added `.is('deleted_at', null)` filter to subsidy_items query
- **app/subsidies/actions.ts**: Already used `createClient()`, added `.is('deleted_at', null)` filters to:
  - `fetchMySubsidyItems` query
  - `fetchPendingSubsidyItems` query
  - `updateMySubsidyItem` ownership check query

## Files Modified
- `app/subsidies/manage/actions.ts`: Soft delete, audit logging, UUID removal, createClient migration
- `app/subsidies/manage/page.tsx`: createAdminClient -> createClient
- `app/subsidies/manage/client-page.tsx`: Hardcoded UUID -> env var with fallback
- `app/subsidies/actions.ts`: Added deleted_at filters to 3 queries
- `app/subsidies/page.tsx`: Added deleted_at filter to subsidy_items query

## Key Decisions
- **No createAdminClient needed**: All operations in subsidy files are user-scoped and can rely on RLS policies. The import was removed entirely from manage/actions.ts.
- **Audit logging granularity**: Each soft-deleted transaction gets its own audit log entry (loop in updateSubsidyStatus) for full traceability.
- **Client-side UUID**: Used `process.env.NEXT_PUBLIC_ACCOUNTING_SYSTEM_USER_ID` with hardcoded fallback for backwards compatibility in the client component.
- **Guard on updates**: All `.update()` calls on subsidy_items include `.is('deleted_at', null)` to prevent updating already-deleted records.

## Issues Encountered
- Initial `replace_all` for UUID in client-page.tsx embedded template literal syntax inside regular strings. Fixed by manually extracting into a runtime constant.
