# Phase D+E: Cleanup Work Log

## Date: 2026-03-21

## Task 1: Replace hardcoded role strings in components/lib

### Files Modified (imports + string replacements)

| File | Changes |
|------|---------|
| `app/budget/page.tsx` | `"admin"` -> `ROLE_TYPES.ADMIN`, `"会計"` -> `ROLE_NAMES_JA.ACCOUNTING`, `"leader"` -> `ROLE_TYPES.LEADER` |
| `app/admin/users/page.tsx` | `["会計","部長","副部長"]` -> `MANAGE_MEMBER_ROLE_NAMES`, `"admin"` -> `ROLE_TYPES.ADMIN` |
| `app/admin/users/_components/user-role-manager.tsx` | `"admin"/"general"` -> `ROLE_TYPES.ADMIN/GENERAL` |
| `app/admin/users/_components/team-manager.tsx` | `"general"/"leader"` -> `ROLE_TYPES.GENERAL/LEADER` |
| `app/members/page.tsx` | `"会計"` -> `ROLE_NAMES_JA.ACCOUNTING` |
| `app/members/manage/page.tsx` | `["部長","副部長","会計"]` -> `MANAGE_MEMBER_ROLE_NAMES`, `"admin"` -> `ROLE_TYPES.ADMIN` |
| `lib/use-sidebar-data.ts` | `"会計"` -> `ROLE_NAMES_JA.ACCOUNTING`, `["部長","副部長","会計"]` -> `MANAGE_MEMBER_ROLE_NAMES`, `"admin"` -> `ROLE_TYPES.ADMIN` |
| `lib/teams.ts` | All role string literals replaced with constants |
| `components/ledger-view.tsx` | `userRoleStr` computation uses `ROLE_TYPES.*` |
| `components/transaction-form.tsx` | `userRole === "admin"/"accounting"` -> `ROLE_TYPES.*` |

### Strings intentionally NOT replaced

- `"会計"` in `client-page.tsx`, `transaction-form.tsx`, `actions.ts` files: These are **display text** for the accounting system user name, not role identifier comparisons
- TypeScript type annotations like `"general" | "leader"`: These define interface shapes; changing them would require cascading changes across many components. Left as future improvement.
- `lib/validations.ts`: Zod enum values `["general", "leader"]` match DB column values in schema validation

## Task 2: Remove duplicate RoleRow/UserRoleRow type definitions

**Result**: None found. Already clean.

## Task 3: Remove remaining flattenRoles/extractRoles helpers

**Result**: None found. Already clean.

## Task 4: Add @deprecated JSDoc to findProfileIdByStudentNumber

Added deprecation notice to `lib/account.ts:55`:
```typescript
/**
 * @deprecated profileId === user.id. Use resolveAuthContext() from lib/auth/context.ts instead.
 */
```

Call sites (5 remaining, all in page-level server components):
- `app/subsidies/page.tsx`
- `app/admin/users/page.tsx`
- `app/page.tsx`
- `app/members/manage/page.tsx`
- `lib/use-sidebar-data.ts`

## Task 5: Acceptance Criteria

| Check | Result |
|-------|--------|
| RoleRow/UserRoleRow duplicates outside types.ts | None |
| flattenRoles/extractRoles remaining | None |
| Hardcoded "会計" outside constants (as role ID) | None (remaining are display text) |
| TypeScript `tsc --noEmit` | Pass (0 errors) |
