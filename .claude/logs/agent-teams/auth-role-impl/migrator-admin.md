# Migration Log: migrator-admin

Date: 2026-03-21

## Task 1: app/admin/actions.ts

### Changes Made
- **Removed**: Local `verifyAdmin()` function (lines 24-49) - now using `verifyAdmin(auth)` from `lib/auth/permissions.ts`
- **Removed**: Local `RoleRow` and `UserRoleRow` type definitions (lines 16-22)
- **Removed**: Imports of `createClient`, `extractStudentNumberFromUser`, `findProfileIdByStudentNumber`
- **Added**: Imports of `resolveAuthContext`, `verifyAdmin`, `ROLE_TYPES`
- **Replaced**: All 3 `createClient()` calls (one per exported function) with single `resolveAuthContext()` per function
- **Replaced**: All hardcoded `"admin"` strings with `ROLE_TYPES.ADMIN` (in `setGlobalAdmin` role query and insert)
- **Replaced**: All `supabase.` DB calls with `auth.supabase.` to use the shared client

### Functions Migrated (3)
1. `setGlobalAdmin(userId, enable)` - was creating 2 supabase clients (one in verifyAdmin, one local), now uses 1
2. `assignGroupRole(userId, groupId, roleType)` - same pattern, reduced from 2 to 1 client
3. `removeGroupRole(userId, groupId)` - same pattern, reduced from 2 to 1 client

### Behavior Preserved
- All validation schemas unchanged
- All error messages unchanged
- All revalidatePath calls unchanged
- Business logic (role creation, user_roles insert/delete) unchanged

## Task 2: app/members/manage/actions.ts

### Changes Made
- **Removed**: Local `checkManagePermission()` function (lines 33-62) - now using `verifyManageMembersPermission(auth)` from `lib/auth/permissions.ts`
- **Removed**: Local `RoleRow` and `UserRoleRow` type definitions (lines 23-30)
- **Removed**: Imports of `createClient`, `extractStudentNumberFromUser`, `findProfileIdByStudentNumber`
- **Added**: Imports of `resolveAuthContext`, `verifyAdmin`, `verifyManageMembersPermission`, `ROLE_NAMES_JA`
- **Replaced**: All `createClient()` calls with `resolveAuthContext()` (one per function)
- **Replaced**: Hardcoded `"仮部員"` with `ROLE_NAMES_JA.PROVISIONAL_MEMBER`
- **Replaced**: Hardcoded `"OB・OG"` with `ROLE_NAMES_JA.ALUMNI`
- **Replaced**: All `supabase.` DB calls with `auth.supabase.` for RLS-respecting operations
- **Simplified**: `deleteMember` audit log - uses `auth.profileId` directly instead of re-resolving user/studentNumber/profileId

### Functions Migrated (5)
1. `addMember(raw)` - uses `verifyManageMembersPermission(auth)`, keeps `createAdminClient()` for auth.admin.*
2. `updateMember(userId, data)` - same pattern
3. `retireMember(userId)` - same pattern
4. `deleteMember(userId)` - same pattern, simplified audit log to use `auth.profileId`
5. `resetPasswordMember(userId)` - uses `verifyAdmin(auth)` (admin-only), keeps rate limiting logic

### Behavior Preserved
- All validation schemas unchanged
- All error messages unchanged
- All revalidatePath calls unchanged
- `createAdminClient()` still used for Supabase auth.admin.* operations (separate from RLS client)
- Rate limiting in `resetPasswordMember` unchanged
- Audit logging in `deleteMember` preserved (simplified but equivalent)

## Type Check Results
- `npx tsc --noEmit` shows 0 errors in migrated files
- Pre-existing error in `app/ledger/actions.ts(28,39)` is outside scope (not my file)

## Summary of Improvements
- **Client creation reduced**: From 2 clients per function to 1 (via `resolveAuthContext`)
- **Duplicated auth logic removed**: 2 local permission functions replaced by shared library
- **Duplicated types removed**: 2 sets of `RoleRow`/`UserRoleRow` eliminated
- **Magic strings replaced**: `"admin"`, `"仮部員"`, `"OB・OG"` now use constants
- **No authorization regressions**: Same permission checks, just centralized
