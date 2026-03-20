# Work Log: Actions-Members-Admin

## Summary
Implemented soft delete for member deletion, replaced `createAdminClient()` with RLS-respecting `createClient()` for all regular DB operations, added `deleted_at` filters to all profile SELECT queries, and added audit logging for soft delete events.

## Tasks Completed

### Task 1: Soft delete in `deleteMember`
- Converted physical delete to soft delete: `profiles.update({ deleted_at, updated_at })` instead of `profiles.delete()`
- Physical delete of `user_roles` kept (junction table, not financial data, documented with comment)
- Physical delete of auth user kept (Supabase auth system, not financial records, documented with comment)
- Added pre-delete fetch of profile data for audit trail
- Added `logAuditEvent()` call with action `SOFT_DELETE`, recording old profile data and the `deleted_at` timestamp
- Added guard: returns error if profile not found or already soft-deleted

### Task 2: Replace `createAdminClient()` in `app/members/manage/actions.ts`
- `addMember`: admin kept for `auth.admin.createUser()`, switched to `createClient()` for profiles upsert, roles select, user_roles insert
- `updateMember`: admin kept for `auth.admin.updateUserById()`, switched to `createClient()` for profiles update, user_roles delete/insert
- `retireMember`: admin kept for `auth.admin.updateUserById()`, switched to `createClient()` for profiles update, user_roles delete/insert, roles select
- `deleteMember`: admin kept for `auth.admin.deleteUser()`, switched to `createClient()` for profiles select/update, user_roles delete
- `resetPasswordMember`: admin kept for `auth.admin.updateUserById()` (was already using `createClient()` for permission checks)

### Task 3: Replace `createAdminClient()` in other files
- `app/members/manage/page.tsx`: replaced admin with existing `supabase` (createClient) for profiles, roles, user_roles queries. Removed `createAdminClient` import.
- `app/members/page.tsx`: replaced admin with existing `supabase` (createClient) for profiles, user_roles queries. Removed `createAdminClient` import.
- `app/admin/users/page.tsx`: replaced admin with existing `supabase` (createClient) for profiles, user_roles queries. Removed `createAdminClient` import.
- `app/admin/actions.ts`: replaced all `createAdminClient()` calls with `supabase` (createClient) for roles and user_roles operations. Removed `createAdminClient` import entirely (no auth.admin.* calls in this file).
- `app/admin/create-user.ts`: kept admin for `auth.admin.createUser()`, switched profiles upsert to `supabase`. Consolidated duplicate imports.

### Task 4: Add `deleted_at` filters
- `app/members/manage/page.tsx`: `.is('deleted_at', null)` on profiles SELECT
- `app/members/page.tsx`: `.is('deleted_at', null)` on profiles SELECT
- `app/admin/users/page.tsx`: `.is('deleted_at', null)` on profiles SELECT
- `app/members/manage/actions.ts` (`updateMember`): `.is('deleted_at', null)` on profiles UPDATE
- `app/members/manage/actions.ts` (`retireMember`): `.is('deleted_at', null)` on profiles UPDATE
- `app/members/manage/actions.ts` (`deleteMember`): `.is('deleted_at', null)` on profiles SELECT and UPDATE

## Files Modified
- `app/members/manage/actions.ts`: Soft delete, audit logging, createClient migration, deleted_at filters
- `app/members/manage/page.tsx`: createClient migration, deleted_at filter
- `app/members/page.tsx`: createClient migration, deleted_at filter
- `app/admin/actions.ts`: createClient migration, removed createAdminClient import
- `app/admin/create-user.ts`: createClient migration for DB ops, consolidated imports
- `app/admin/users/page.tsx`: createClient migration, deleted_at filter

## Key Decisions
1. **Junction table (user_roles) physical delete**: Kept physical deletion for user_roles in deleteMember since it's a junction table with no financial significance. Documented with inline comment.
2. **Auth user physical delete**: Kept physical deletion of auth user since it's part of Supabase auth system, not financial records. The soft-deleted profile preserves the data trail. Documented with inline comment.
3. **Audit logging scope**: Only added audit logging for the soft delete operation (deleteMember), as this is the most critical data integrity event. Other operations (update, retire) could be added later.
4. **`deleted_at` filter on UPDATE queries**: Added `.is('deleted_at', null)` to UPDATE operations in updateMember and retireMember to prevent modifying soft-deleted profiles.

## Issues Encountered
- None. TypeScript compilation passes cleanly (`npx tsc --noEmit` with zero errors).
