# migrator-actions Work Log

Date: 2026-03-21

## Task
Migrate 6 action files to use the new auth/role library (resolveAuthContext, getUserRoleAccess, etc.)

## Files Changed

### 1. app/subsidies/actions.ts (auth-only migration)
- 4 functions migrated: createSubsidyItem, fetchMySubsidyItems, fetchPendingSubsidyItems, updateMySubsidyItem
- Replaced createClient + getUser + extractStudentNumber + findProfileIdByStudentNumber with resolveAuthContext()
- Removed imports: extractStudentNumberFromUser, findProfileIdByStudentNumber, createClient

### 2. app/ledger/actions.ts (auth + role cleanup)
- 1 function migrated: fetchLedgerTransactions
- Replaced createClient + getUser with resolveAuthContext()
- Replaced inline role normalization with getUserRoleAccess()
- Replaced hardcoded "部長"/"副部長" with ROLE_NAMES_JA.CHAIR/ROLE_NAMES_JA.VICE_CHAIR
- Removed local `Role` type definition
- Kept profile?.role === "accounting" check (legacy compatibility, to be unified later)

### 3. app/actions.ts (4 auth blocks, helper removal)
- 4 functions migrated: uploadReceiptAction, updateTransactionStatus, updateTransaction, deleteTransaction
- signOut() also migrated to use resolveAuthContext
- Removed: flattenRoles() helper, RoleRow type, UserRoleRow type
- Replaced hardcoded "admin"/"leader" with ROLE_TYPES.ADMIN/ROLE_TYPES.LEADER
- Replaced inline role queries with getUserRoleAccess()
- Removed imports: extractStudentNumberFromUser, findProfileIdByStudentNumber, createClient (kept createAdminClient)

### 4. app/budget/actions.ts (2 auth blocks, helper removal)
- 2 functions migrated: upsertBudget, createFiscalYearBudgets
- Removed: extractRoles() helper, RoleRow type, UserRoleRow type
- upsertBudget now uses canManageBudget() from lib/roles/access
- createFiscalYearBudgets now uses access.isAdmin/access.hasAccountingRole
- Removed imports: extractStudentNumberFromUser, findProfileIdByStudentNumber, createClient (kept createAdminClient)

### 5. app/subsidies/manage/actions.ts (4 auth blocks with role checks)
- 5 functions migrated: fetchAllSubsidies, updateSubsidyStatus, updateSubsidyItem, deleteSubsidyItem
- fetchProfilesList kept as-is (no auth needed, just RLS)
- Removed: RoleRow type, UserRoleRow type
- Replaced hardcoded "会計"/"admin" role checks with access.isAdmin/access.hasAccountingRole
- Removed imports: extractStudentNumberFromUser, findProfileIdByStudentNumber

### 6. app/admin/create-user.ts (2 auth blocks)
- 2 functions migrated: adminCreateUser, adminResetPassword
- Removed: UserRoleRow type, inline admin role check
- Now uses verifyAdmin(auth) from lib/auth/permissions
- Removed imports: extractStudentNumberFromUser, findProfileIdByStudentNumber, createClient (kept createAdminClient)

## Verification
- `npx tsc --noEmit` passes with zero errors

## Summary of Removals
- 3 helper functions removed: flattenRoles (app/actions.ts), extractRoles (app/budget/actions.ts)
- 6 local type definitions removed: RoleRow/UserRoleRow from app/actions.ts, app/budget/actions.ts, app/subsidies/manage/actions.ts, app/admin/create-user.ts
- 1 local type removed: Role from app/ledger/actions.ts
- ~15 auth copy-paste blocks replaced with resolveAuthContext()

## Notes
- profile?.role === "accounting" legacy check preserved in app/actions.ts and app/ledger/actions.ts for backward compatibility
- fetchProfilesList in app/subsidies/manage/actions.ts still uses createClient() directly (no auth needed)
