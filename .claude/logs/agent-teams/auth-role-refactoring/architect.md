# Architect Work Log: Auth/Role Refactoring

Date: 2026-03-21

## Tasks Completed

### 1. Codebase Analysis Review
- Read all 8 action files with duplicate auth patterns
- Read lib/account.ts, lib/teams.ts, utils/supabase/server.ts
- Confirmed findProfileIdByStudentNumber ignores studentNumber param and just returns user.id
- Confirmed verifyAdmin/checkManagePermission create internal clients that callers discard

### 2. Codex Architecture Consultation
- Consulted Codex (gpt-5.4) for architecture design
- Key decision: Separate auth resolution from role fetching (two-layer design)
- Key decision: Unified role projection `roles(name, type, accounting_group_id)` everywhere
- Key decision: const object pattern for role constants (not enum, not string union)

### 3. Implementation Plan Created
- Saved to: `.claude/docs/research/auth-role-implementation-plan.md`
- 5 phases (A-E), 27 steps
- Full API designs with TypeScript signatures
- Before/after usage examples
- Risk mitigations and acceptance criteria

## Key Design Decisions

1. **Two-layer architecture**: `resolveAuthContext()` (auth only) + `getUserRoleAccess()` (roles)
   - Reason: Many call sites only need auth, not roles. Bundling them wastes a DB query.

2. **File structure**: `lib/auth/` and `lib/roles/` directories
   - Reason: Clear separation of concerns, avoids bloating existing files

3. **const object for role constants** (not enum)
   - Reason: Better tree-shaking, works with Supabase string types, no runtime overhead

4. **Unified role projection**: Always `roles(name, type, accounting_group_id)`
   - Reason: Current partial projections caused 7 different type definitions. One canonical shape eliminates all.

5. **Optional supabase param in resolveAuthContext()**
   - Reason: Some callers may need admin client or already have a client

## Files Read
- app/actions.ts (lines 1-60)
- app/admin/actions.ts (lines 1-70)
- app/budget/actions.ts (lines 1-60)
- app/ledger/actions.ts (lines 1-50)
- app/subsidies/manage/actions.ts (lines 1-50)
- app/members/manage/actions.ts (lines 1-70)
- lib/account.ts (full)
- lib/teams.ts (full)
- utils/supabase/server.ts (full)

## Deliverables
- `/home/yuulis/musenken-finance-app/.claude/docs/research/auth-role-implementation-plan.md`
