# P1-1 Plan: Typed Supabase Client and Centralized Permissions

Status: draft for user approval (no code changed). Branch `feature/p1-typed-permissions` (from `develop`, HEAD `c6df92f`).
Date: 2026-10-22. Author: general-purpose-opus, with a read-only Codex review
(`.claude/logs/codex/20261022T104917Z-p1-plan.md`).

Effort scale (from `docs/manual/project-status/refactoring.md`): S = 1-4 h, M = 4-12 h, L = 12 h+.

---

## 1. Goals and non-goals

### Goals

1. **R3**: `lib/database.types.ts` regenerated from migrations; the Server Action client (`AuthContext.supabase`) typed with `Database`; generated-type drift fails CI.
2. **R4**: one module owns role parsing and one module owns permission predicates; every re-implementation is migrated; current behaviour is preserved unless a bug is identified below.
3. **R5**: budget edit permission is identical on the page and on the server.
4. **Item 4**: `updateTransaction` (and `createTransaction`) check permission on the destination accounting group.
5. **Item 5**: transaction approval works for the intended approvers, never reports success when nothing was written, and self-approval is blocked in the app and in the DB.
6. **Item 6**: every write that the app authorizes but RLS silently filters ("0 rows, success") is listed, and fixed or explicitly deferred.

### Non-goals

- Data-access layer, file splitting, unified action return type (R8), request-scoped `cache()` of roles (R14). R4 only makes R14 possible.
- Transactionalizing multi-step writes (R6), except where a step below needs it for correctness. The subsidy "unexecuted" cleanup and member-role replacement stay in R6.
- Deleting dead code (R9: `app/(authenticated)/admin/actions.ts`, `admin/create-user.ts`). They are not migrated to the new module; R9 deletes them.
- DB-enforced read confidentiality per group. `transactions_select_non_deleted` exposes every non-club row to every member (`20260612120000_add_club_wide_ledger.sql:361-372`); the new `canViewGroup` predicate is app-level only. That is roadmap decision #1.
- Transfer-pair approval (`components/approval-actions.tsx:45-47`). The approval change below does not make transfer approval pair-safe.

---

## 2. Current state and evidence

All DB reproductions ran on the local stack (migration level `20261022130000`, `select max(version) from supabase_migrations.schema_migrations`) inside `BEGIN … ROLLBACK`, using `SET LOCAL ROLE authenticated` and `request.jwt.claims`. Scripts: `/tmp/claude-1002/-home-yuulis-musenken-finance-app/509d787f-1fdf-4a38-901b-c5a0f4f66fd8/scratchpad/repro.sql`, `repro_minimal.sql`, `repro2.sql` in the same directory. The PostgREST check used committed fixtures that were deleted afterwards (leftover count 0).

### 2.1 R3: types

| Claim | Evidence |
|---|---|
| Server Action client is untyped | `lib/auth/types.ts:3` `SupabaseServerClient = SupabaseClient` |
| Page client is already typed | `utils/supabase/server.ts:11` `createServerClient<Database>` |
| Drift check is informational | `.github/workflows/ci.yml:58-60` (`continue-on-error: true`) |
| CI pins CLI 2.120.0, local is 2.121.0 | `ci.yml:44`, `deploy-db.yml:32`, `supabase --version` |
| 2.120.0 and 2.121.0 generate byte-identical types today | `npx -y supabase@2.120.0 gen types typescript --local` vs `supabase gen types typescript --local`, `cmp` → identical (465 lines) |
| Regenerated types alone: 0 tsc errors | scratch worktree, `npx tsc --noEmit` → 0 |
| Regenerated types + `SupabaseClient<Database>`: 6 errors | `app/actions.ts:237` (insert payload widened to `string` for `approval_status`/`transaction_kind`); `app/(authenticated)/subsidies/actions.ts:67` (`income_type as string`); `subsidies/manage/actions.ts:158` (`status: string`); `subsidies/manage/actions.ts:276` (`category: string`); `ledger/actions.ts:265-266` (`create_transfer` optional args typed `string \| undefined`, code passes `null`). The refactoring doc counted 4; the two `ledger/actions.ts` errors are new. |
| `updateTransaction` payload is untyped | `app/actions.ts:431` `const updates: Record<string, unknown>` |
| Generated file line endings | `git ls-files --eol lib/database.types.ts` → `i/lf w/crlf` (index LF; local `core.autocrlf=true`). `.gitattributes` has no rule for it. |
| pgTAP tests exist but CI never runs them | `supabase/tests/database/*.test.sql`; `ci.yml` db job has no `supabase test db` step |

### 2.2 R4: role parsing and predicate duplicates

Canonical: `lib/roles/access.ts:25-68` (`getUserRoleAccess`), `:78-91` (`isGroupLeader`, `canManageBudget`); `lib/auth/permissions.ts` (`verifyAdmin`, `verifyManageMembersPermission`, `canViewClubLedger`, `canCreateClubTransaction`, `canManageFinancialAccounts`, `verifyClubTransactionPermission`); `lib/roles/assignment.ts` (S1 delegable-role rule). `getUserRoleAccess` drops the query error and returns an empty-role context (`lib/roles/access.ts:28-31`).

Role-row parsing re-implementations (each one flattens `user_roles → roles` itself):

| # | Site | What it derives |
|---|---|---|
| P1 | `lib/teams.ts:36-60` (+ `:67-70`) | isAdmin, 会計, "full access" = admin/会計/部長/副部長; group list. Also `:75` turns club groups into type `"general"` |
| P2 | `app/(authenticated)/budget/page.tsx:87-116` | isAdmin, 会計, `myGroupRoles` (last role type per group wins, `:112-116`) |
| P3 | `app/(authenticated)/members/manage/page.tsx:40-80` (`extractRoleInfo`, `hasAccess` `:77-80`) | member-management access |
| P4 | `app/(authenticated)/members/page.tsx:34-60` | role names of all users (display, and hiding 会計-only accounts `:60`) |
| P5 | `lib/use-sidebar-data.ts:65-82`, `:96-99`, `:153-175` | client side (browser client + SWR): nav visibility |
| P6 | `app/(authenticated)/members/manage/actions.ts:61-75` (`fetchRolesById`) | S1 input; service-role read; keep, reuse shared normalizer |

Inline permission predicates that should call the shared module:

| Site | Rule today |
|---|---|
| `app/actions.ts:211-215` | club group create → admin or 会計 |
| `app/actions.ts:291-298` | approve → admin or leader of tx group (inline leader check) |
| `app/actions.ts:379-401` | edit → owner, admin, 会計, or leader of tx group; non-privileged only when pending |
| `app/actions.ts:449-470` | set created_by / approved_by → admin; set approval_status → admin or 会計 |
| `app/actions.ts:534-539` | delete → admin, or owner while pending |
| `app/(authenticated)/ledger/actions.ts:46-53`, `:71-79` | "full access" (re-computed), group view rule |
| `app/(authenticated)/budget/actions.ts:38` / `:114` / `:183,:220,:270` | budget edit (admin or group leader) / new FY (admin or 会計) / group admin ops (admin) |
| `app/(authenticated)/subsidies/manage/actions.ts:26,149,247` / `:324` | admin or 会計 / admin |
| `app/(authenticated)/subsidies/actions.ts:274-279` | owner or admin; pending unless admin |
| `components/ledger-view.tsx:123`; `components/ledger/ledger-desktop-table.tsx:171-174,307`; `ledger-mobile-cards.tsx:80,135` | UI edit/approve flags = admin or 会計 |
| `components/transaction/admin-fields.tsx:61,95,145` | admin-only fields; approval_status field for admin or 会計 |
| `components/ledger-view.tsx:125-127` | club group detected by display name `"部全体"` |

Not migrated: `app/(authenticated)/admin/actions.ts` (dead, R9).

### 2.3 R5: budget

| Claim | Evidence |
|---|---|
| Page shows edit controls to admin, or to 会計 / any-group leader in the current FY | `budget/page.tsx:203-209`, rendered `:320-346` |
| Leaders without 会計 never reach those controls | page gate `budget/page.tsx:119-134` |
| Server allows only admin or the leader of the target group | `budget/actions.ts:37-40` → `lib/roles/access.ts:86-91` |
| So a 会計 who is not admin gets 予算の編集権限がありません on save | above two rows |
| `createFiscalYearBudgets` (shown in the same toolbar) allows admin or 会計 | `budget/actions.ts:113-116` |
| No past-year guard on the server; `fiscalYear` comes from the client | `budget/actions.ts:42-53`; page-only banner `budget/page.tsx:226-230` |
| Writes use service role (no RLS write policy on `budgets`) | `budget/actions.ts:68-85`; only `budgets_select_authenticated` exists (`pg_policies`) |
| Spec: budget F1-F3 = admin (Tier 1) and 会計 (Tier 2) only; 班長 (Tier 4) denied | `docs/specification.md:158-180` (local, git-ignored) |
| Beta checklist: 会計 must be able to set/change budgets; 班長 has no management features | `docs/beta-test/checklist_accounting.md:106-110`; `docs/beta-test/README.md:21`; `checklist_group_leader.md:26-28` |
| History: the leader rule predates the module | `git show 90a54c7 -- app/budget/actions.ts` (inline `isGlobalAdmin \|\| isGroupLeader`) |

Conclusion: the page (and the spec) is the intended side; the server's leader rule is the bug. The leader branch on the page (`:208`) is dead code. Remaining question for the user: whether 会計 may edit past fiscal years (page says no for non-admin).

### 2.4 Item 4: destination group

| Claim | Evidence |
|---|---|
| `updateTransaction` authorizes against the current group only and writes the client's `accounting_group_id` | `app/actions.ts:379-391`, `:436` |
| `createTransaction` checks only the club case, not membership | `app/actions.ts:203-216` |
| UI rule for which groups a user may file under: full access → all active groups; others → groups of type `general`/null plus groups where they hold a role | `lib/teams.ts:67-100`; form options `app/(authenticated)/applications/page.tsx:32-33,83` |
| DB: a member can move own pending tx to an unrelated non-club group | repro case 5 → `UPDATE 1` |
| DB: moving to the club group fails with an RLS error (SELECT policy hides club rows from the new row) | repro case 6 → `ERROR: new row violates row-level security policy` |
| DB INSERT policy group check is a tautology | `20260612120000_add_club_wide_ledger.sql:375-392`; `pg_policies.with_check` shows `r.accounting_group_id = r.accounting_group_id` |
| A user with a role only in G2 can insert into G | repro case 3 → `INSERT 0 1` |

### 2.5 Item 5: leader approval (confirmed bug, plus a bigger one)

| Claim | Evidence |
|---|---|
| Server approvers = admin or leader of tx group; self-approval blocked | `app/actions.ts:290-305` |
| Update result is not checked for affected rows; audit is written and `{success:true}` returned | `app/actions.ts:314-339` |
| Transaction UPDATE policies: own pending, admin/会計, admin | `20260320100100_add_rls_policies.sql:84-107` (`pg_policies` confirms no later change) |
| Guard trigger rejects approval-column changes by non-admin/non-会計 Data API writers | `20261022120000_guard_protected_write_columns.sql:46-56,140-166` |
| **Leader approval affects 0 rows; row stays `pending`** | repro case 1 → `UPDATE 0`, `status_after_leader = pending` (RLS filters the row before the trigger fires) |
| **PostgREST reports success** | `PATCH /rest/v1/transactions?id=eq.… Prefer: return=minimal` with a leader JWT → `HTTP 204`; row unchanged |
| So the action returns success and writes a false audit row | `audit_logs_insert_own` allows it (`20260320100200_add_audit_log.sql:48-51`); `lib/audit-log.ts:13-30` |
| **会計 (not admin) cannot approve at all**: UI shows the buttons, server rejects with 承認権限がありません | buttons gated by admin-or-会計: `components/ledger-view.tsx:123`, `ledger-desktop-table.tsx:304-310`, `ledger-mobile-cards.tsx:132-135`; server `app/actions.ts:298-300` |
| Leaders never see approval buttons | same UI flags |
| 会計 approval would work at the DB level | repro case 2 → `UPDATE 1` |
| Spec: approvers = admin/会計; 会計 cannot approve own | `docs/specification.md:63,123`; checklist `checklist_accounting.md:83` |
| Self-approval bypass: 会計 can set `approval_status` on their own tx via the edit form; `approved_by` stays unset | `app/actions.ts:462-470`; field shown `components/transaction/admin-fields.tsx:95`; spec says direct status change is admin-only (`specification.md:70`) |
| DB does not block self-approval for 会計/admin Data API callers, nor pre-approved INSERTs or `created_by` reassignment by 会計 | trigger early return `guard…sql:146-148`; `transactions_update_admin_accounting` has no column limits |
| `updateTransactionStatus` does not require the current status to be `pending` | `app/actions.ts:277-317` (no status predicate) |
| Approval controls ignore the historical-year read-only flag | `ledger/page.tsx:77` vs `ledger-desktop-table.tsx:304-310` |
| History: leader-only server rule since the alpha | `git log -S "承認権限" -- app/actions.ts` → `15e41a8`, `738177f` |

Production impact: leader approval is unreachable from the UI, so false "success" needs a direct action call. The practical bug is that a 会計 who is not admin cannot approve. A read-only production check for false approvals: `audit_logs` rows with `table_name='transactions'`, `action='UPDATE'`, `new_data ? 'approval_status'` whose transaction is still `pending`.

### 2.6 Item 6: the same mismatch elsewhere

| Flow | Result | Evidence |
|---|---|---|
| Leader edits a member's tx (`updateTransaction` allows leaders) | 0 rows, success | repro case 4 → `UPDATE 0`; `app/actions.ts:381-391` |
| Leader-owner edits own non-pending tx (app allows, `transactions_update_own` requires pending) | 0 rows, success | `app/actions.ts:397-401` vs policy `:84-92` |
| Budget edits by leaders | no RLS mismatch (service role), but app/page/spec mismatch (R5) | §2.3 |
| Group-year management (`deleteGroupYearData`, toggle, create group) | admin-only, service role; consistent | `budget/actions.ts:182-252,270` |
| Owner hard-deletes own pending subsidy item (non-admin) | 0 rows, success (no owner DELETE policy on `subsidy_items`) | repro case 7 → `DELETE 0`; `subsidies/actions.ts:295-299`; `pg_policies` |
| 会計 sets subsidy to `unexecuted`, deleting linked transactions | 0 rows deleted, success (DELETE only admin / own pending) | repro case 8 → `DELETE 0`; `subsidies/manage/actions.ts:177-200`. No current code creates linked rows (`grep subsidy_item_id`), so legacy data only |
| Non-admin member manager (部長/副部長/会計) edits another member | profile update 0 rows (profiles: own or admin), then Auth metadata and roles are changed with service role → inconsistent | `members/manage/actions.ts:244-254`; policies `20260320100100…:45-55` (Codex finding, verified by reading) |
| Non-admin member manager retires a member | profile 0 rows, role delete 0 rows (user_roles: admin only), OB insert fails → partial state | `members/manage/actions.ts:333-363`; policy `…:166-169` |
| Subsidy flows for 会計 (status/edit) | allowed by `subsidy_items_update_admin_accounting`; consistent | `…add_rls_policies.sql:139-145` |

---

## 3. Design per item

### 3.1 R3: typed client

- Regenerate with the CI-pinned CLI (`npx -y supabase@2.120.0 gen types typescript --local`, or `npm run db:types` while 2.120/2.121 output is identical). Generate after `supabase db reset --local` so the source is migrations, never the remote project. Commit the raw generator output; do not format it.
- Add `lib/database.types.ts text eol=lf` to `.gitattributes`.
- `SupabaseServerClient = SupabaseClient<Database>`.
- Fix errors with generated types, not casts: `TablesInsert<"transactions">` with `satisfies` for `insertData`; `TablesUpdate<"transactions">` for `updates`; Zod enums (or `Database["public"]["Enums"][…]`) so validated values keep their literal types; for `create_transfer` pass `undefined` (SQL default NULL) instead of `null`.
- Remove `as unknown as` in `lib/roles/access.ts:34` if the typed join allows it (it moves into `parse.ts` anyway).
- CI: drop `continue-on-error`; add `supabase test db` after `db reset`. Keep both CLI pins equal (bump both to 2.121.0 only deliberately).
- Alternatives: keep the remote-generated file (rejected: it diverges from migrations, e.g. `transaction_kind` enum vs TEXT+CHECK); format with Prettier/oxfmt (rejected: drift check compares raw output).

### 3.2 R4: module layout

| Module | Role | Boundary |
|---|---|---|
| `lib/roles/constants.ts`, `types.ts` | existing constants/types; `RoleAccessContext` gains `hasAllNonClubGroupAccess` | pure |
| `lib/roles/parse.ts` (new) | `normalizeJoined<T>(rel: T \| T[] \| null): T[]`; `parseRoleAssignments(rows)`; `buildRoleAccess(roles): RoleAccessContext` | pure, isomorphic |
| `lib/roles/permissions.ts` (new) | per-operation predicates (below) | pure, isomorphic |
| `lib/roles/access.ts` | `getUserRoleAccess(auth)` = query + parse + build; returns a lookup error instead of an empty context | `import "server-only"` |
| `lib/roles/assignment.ts` | S1 unchanged; imports constants only | pure |
| `lib/auth/permissions.ts` | async `verify*` wrappers only; club predicates move to `lib/roles/permissions.ts` (re-export once to keep `tests/lib/club-ledger.test.ts` green, then update the import) | server-only |
| `lib/teams.ts` | `getUserTeams(access)` filters cached groups with `canViewGroup`; keeps the real group type (`club`/`general`/…) | server-only |

Predicates (all take `RoleAccessContext`; group/tx arguments are plain objects):

- `isAccounting`, `hasAllNonClubGroupAccess` (admin/会計/部長/副部長). Club checks run first; 部長/副部長 never inherit club rights.
- `canViewGroup(access, group)`; `canFileTransactionInGroup(access, group)`:
  club → admin or 会計; otherwise admin, 会計, 部長/副部長, group type `general`/null, or a role in the group; missing group → false.
- `canApproveTransaction(access, tx, actorId)` → per decision D1 (default admin or 会計) and `tx.created_by !== actorId` and `tx.approval_status === "pending"`.
- `canEditTransaction(access, tx, actorId)` → owner while pending, admin, 会計 (leader branch removed, D6).
- `canSetApprovalFieldsDirectly(access, tx, actorId)` → admin; 会計 per D3, never on own rows.
- `canDeleteTransaction` (unchanged rule), `canEditBudget(access, fy)` (D4), `canCreateFiscalYear` (admin or 会計), `canManageGroups` (admin), `canManageSubsidies` (admin or 会計), `canManageMembers` (unchanged), club-ledger predicates (moved).

Keep current semantics: admin = `type === "admin"`; 会計 = `name === "会計"` (DB `has_role('会計')` is name-based); 部長/副部長 by name. Changing to type-based detection would diverge from the DB.

Alternatives: one class/`can(action, subject)` DSL (rejected: over-abstraction for ~12 rules); put predicates in `lib/auth/permissions.ts` (rejected: that module is server-only, the sidebar needs the predicates on the client).

### 3.3 R5: budget

Default (D4): `canEditBudget = isAdmin || (isAccounting && fiscalYear.isCurrent)`. The server resolves the fiscal year itself (also when the client passes one) and rejects past years for non-admins. Leaders get nothing. The page uses the same predicate, so the dead leader branch (`budget/page.tsx:208`) goes away. `NewFiscalYearDialog` stays admin-or-会計.

### 3.4 Item 4: destination group

- App: `createTransaction` and `updateTransaction` call `canFileTransactionInGroup` on the destination (in `updateTransaction`, only when `accounting_group_id` changes, so legacy rows in groups the editor can no longer select can still be edited). Group lookup failure → deny.
- DB (decision D5, recommended): new migration with a `public.can_file_in_group(p_group_id uuid)` SQL helper (argument-based, which removes the column-resolution trap), a corrected `transactions_insert_member` policy, and a destination-change check in `guard_transactions_write` for UPDATEs that change `accounting_group_id`. A change-specific trigger is used instead of a policy `WITH CHECK` so unrelated edits of legacy rows keep working; permissive policies OR together, so a new narrow policy would not constrain the existing ones.
- The corrected rule is not uniformly stricter: it denies unrelated groups (bug fix) but newly allows general-group inserts for users with only global roles, and non-club inserts for 部長/副部長 without group roles. Before release, run a read-only production inventory of users × role types × groups. Tier 7 (仮部員/OB・OG) filing eligibility is not decided here (roadmap decision #2); the rule keeps today's UI behaviour.

### 3.5 Item 5: approval

Options considered:

| Option | Privilege | Verdict |
|---|---|---|
| A. Approvers = admin or 会計 (spec, UI, checklists). App-side fix only; DB already permits 会計 | no new privilege | **Recommended (D1)** |
| B. Leaders also approve, via `approve_transaction` SECURITY DEFINER RPC (`SET search_path = ''`; checks `auth.uid()`, row `FOR UPDATE`, not deleted, `pending`, `p_status IN (approved, rejected)`, `created_by <> auth.uid()`, caller admin/会計/leader of row group, club → admin/会計 only; writes `approved_by = auth.uid()`, `approved_at = now()`, and the audit row; `REVOKE` from PUBLIC/anon, `GRANT` to authenticated) | leader gains only this one transition | Least-privilege choice **if** the user wants leader approval |
| C. Service-role update after the app check | DB enforces nothing | Rejected |
| D. Leader UPDATE RLS policy + trigger exemption for approval columns | leaders get row-level UPDATE; trigger must re-implement per-role column limits | Rejected (broader, more complex) |

Option A implementation:

1. `updateTransactionStatus`: `canApproveTransaction`; conditional write `.update(...).eq("id", id).eq("approval_status", "pending").is("deleted_at", null).select("id")`; exactly one row or return a conflict error (the conditional UPDATE is atomic under READ COMMITTED: a concurrent second decision re-checks the predicate and updates 0 rows). Audit only after success. Clear `rejected_reason` on approval.
2. `updateTransaction`: approval fields (`approval_status`, `approved_by`, `approved_at`, `rejected_reason`) may change only through `canSetApprovalFieldsDirectly`; never on the actor's own row unless admin (admin correction stays an explicit break-glass path, logged). When 会計 changes status directly, set `approved_by`/`approved_at` server-side.
3. DB hardening migration (extends `guard_transactions_write`; runs before the admin/会計 early return):
   - non-admin API writers (including 会計) cannot change approval fields on a row where `OLD.created_by = auth.uid()` or `NEW.created_by = auth.uid()`;
   - `created_by` is immutable for non-admin API writers; their INSERTs must have `created_by = auth.uid()` and initial approval fields (`pending`, nulls);
   - compare with `IS DISTINCT FROM`, so resubmitting an unchanged status with a content edit still works;
   - service_role and SECURITY DEFINER paths stay exempt (unchanged `current_user` test); `create_transfer` inserts `pending` rows, so it is unaffected.
4. Self-approval stays blocked: app (`canApproveTransaction`), UI (`approval-actions.tsx:66`), and now DB for 会計 via the edit form or direct PostgREST.

Option B additionally needs: the RPC migration, type regeneration, the app calling `supabase.rpc("approve_transaction", …)`, the UI showing buttons to leaders of the row's group, and the two-phase release in §6.

Disagreement with Codex (recorded): Codex recommends an approval RPC (SECURITY INVOKER) even under option A, for row locking and an audit row written in the same transaction. I recommend deferring it to R6. The conditional UPDATE already closes the race. An atomic audit row for this one action adds little while `audit_logs_insert_own` lets any user insert self-attributed rows and every other action logs best-effort. The RPC would also add a release-order dependency (§6) to the smallest fix in the package. If the user prefers the RPC now, use Codex's invoker design (it keeps RLS and the guard trigger in force for admin/会計).

### 3.6 Item 6: silent 0-row writes

- Singleton user-scoped writes (`updateTransaction`, `updateTransactionStatus`, `deleteTransaction`, `updateSubsidyStatus`, `updateSubsidyItem`, `deleteSubsidyItem`, `deleteMySubsidyItem`) append `.select("id")` and require exactly one row; otherwise return an error and skip audit/cleanup/side effects.
- Owner pending subsidy delete: additive migration `subsidy_items_delete_own_pending` (mirrors `transactions_delete_own_pending`, `20260324130000_…sql`). Old code starts working once it is applied.
- Subsidy `unexecuted` cleanup: P1-1 counts linked rows first and returns an explicit error if the delete removed fewer; the atomic fix (RPC) stays in R6. No broad 会計 DELETE grant.
- Member update/retire by non-admin managers: out of P1-1 scope, but it is a data-integrity bug. Recommended follow-up step 13 (D8): after the existing S1 checks, write `profiles`/`user_roles` with the service-role client the action already uses for roles and Auth, with exactly-one-row checks.

---

## 4. Implementation order (one commit per step unless noted)

Every DB step regenerates `lib/database.types.ts` in the same commit (drift is a hard failure after step 1).

| # | Step | Files touched | Tests | Effort |
|---|---|---|---|---|
| 1 | CI gates and regenerated types | `lib/database.types.ts`, `.gitattributes`, `.github/workflows/ci.yml` | `npm run typecheck` (0 errors verified in a scratch worktree), `supabase test db` locally, CI drift step | S (2 h) |
| 2 | R3 typed server client | `lib/auth/types.ts`, `app/actions.ts`, `app/(authenticated)/subsidies/actions.ts`, `subsidies/manage/actions.ts`, `ledger/actions.ts`, maybe `lib/schema.ts`/`lib/validations.ts` (enum literals) | `npm run typecheck`, `npm test`, `npm run build` | S-M (4 h) |
| 3 | Bug-proof tests (before any fix) | `supabase/tests/database/transaction_write_permissions.test.sql` (new); `tests/app/transaction-actions.test.ts` (new, with a small fake Supabase client and `vi.mock` for `server-only`, `next/cache`, `@/lib/auth/context`, `@/lib/audit-log`, `@/lib/system-config`) | pgTAP: desired assertions wrapped in `todo_start('bug …')/todo_end()`: leader approval changes the row; outsider insert into G denied; member move to unrelated group denied; 会計 self status change denied; owner subsidy delete removes the row. Each asserts row state or counts, not `lives_ok`. Vitest `it.fails(...)`: 会計 approval succeeds; leader approval with 0 affected rows returns an error | M (6 h) |
| 4 | R4 core | `lib/roles/parse.ts`, `lib/roles/permissions.ts` (new), `lib/roles/types.ts`, `lib/roles/access.ts`, `lib/auth/context.ts` (lookup error), `lib/auth/permissions.ts` | `tests/lib/roles-parse.test.ts` (object/array/null/missing fields), `tests/lib/roles-permissions.test.ts` (role × operation matrix incl. club precedence, 部長 without club rights, unknown types), S1 compatibility (adding any delegable role never increases a capability), existing `club-ledger.test.ts` | M (6 h) |
| 5 | R4 server call sites, behaviour-preserving | `app/actions.ts` (`createTransaction`, `deleteTransaction`), `ledger/actions.ts`, `lib/teams.ts` (+ callers `page.tsx`, `applications/page.tsx`, `ledger/page.tsx`, `subsidies/page.tsx`), `subsidies/manage/actions.ts`, `subsidies/actions.ts` | Vitest for `getUserTeams(access)` (general/null/member/unrelated/club/full access, real group type kept); full suite | M (6 h) |
| 6 | Item 5 app fix (option A) and D6 | `app/actions.ts` (`updateTransactionStatus`, `updateTransaction` approval fields, leader edit branch removed), header comment `app/actions.ts:3-17`, `components/approval-actions.tsx` doc comment, `components/transaction/admin-fields.tsx` (per D3) | Flip step-3 Vitest `it.fails` → `it`; new: self-approval denied (all roles), non-pending → conflict, 0 rows → error and no audit, leader denied, 会計 unchanged status + content edit OK | S (3 h) |
| 7 | Item 4 app fix | `app/actions.ts` (`createTransaction`, `updateTransaction`) | Vitest: unchanged legacy group edit OK; move to unrelated group denied; club move by non-会計 denied with a clear message; group lookup failure denied | S (2 h) |
| 8 | R5 budget | `budget/actions.ts` (`upsertBudget` server-side FY), `budget/page.tsx` | Vitest: admin current/past OK; 会計 current OK, past denied; leader denied; unknown FY denied | S (2 h) |
| 9 | R4 UI consumers | `budget/page.tsx`, `members/manage/page.tsx`, `members/page.tsx`, `lib/use-sidebar-data.ts`, `components/ledger-view.tsx` (club by `type`), ledger tables (per-row flags from predicates; historical approval per D7) | Vitest for any extracted pure helpers; `npm run build` (client bundle must not import server-only code); manual check of sidebar/budget/ledger per role | M (5 h) |
| 10 | Silent-write hardening + owner subsidy delete policy | singleton writes listed in §3.6; migration `…_add_subsidy_items_delete_own_pending.sql` | pgTAP: owner deletes own pending item (row gone), cannot delete others'/non-pending; flip step-3 todo. Vitest: 0 rows → error, no audit | M (5 h) |
| 11 | DB: self-approval / creator guard | migration `…_guard_self_approval.sql` (replaces `guard_transactions_write`) | pgTAP: 会計 cannot approve own row (UPDATE and INSERT), cannot reassign `created_by`; 会計 approves others; unchanged status + content edit OK; admin correction OK; service_role and `create_transfer` regressions; existing `guard_protected_write_columns.test.sql` still passes | M (5 h) |
| 12 | DB: group filing rule (D5) | migration `…_fix_transactions_group_checks.sql` (`can_file_in_group`, insert policy, destination-change check) | pgTAP: matrix of general/null/member/unrelated/club × member/leader/部長/会計/admin for INSERT and changed-destination UPDATE; unchanged legacy group edit OK; flip step-3 todos | M (6 h) |
| 13 | (Optional, D8) member update/retire writes | `members/manage/actions.ts` | Vitest with fake client: non-admin manager update/retire writes exactly one profile row; S1 tests unchanged | S (3 h) |

Total: about 50-55 h without option B. Option B adds about 6 h (RPC, pgTAP, UI flags, two-phase release).

Dependencies: 2 → 1; 3 → 1; 4 → 2; 5-9 → 4; 6 → 3; 10 → 3; 11 → 6; 12 → 7. Steps 1-9 need no DB change.

Acceptance commands for every step: `npm run lint && npm run typecheck && npm test && npm run build`; for DB steps also `supabase db reset --local && supabase db lint --local --fail-on error --level error && supabase test db && npm run db:types && git diff --exit-code -- lib/database.types.ts`.

---

## 5. Tests summary

- Vitest stays in `tests/**/*.test.ts` (node env, `vitest.config.mts`). Action tests are new: they mock module boundaries, not Supabase internals, and use a tiny fake query builder that records calls and returns configured `{data, error}` (including empty `data` to simulate RLS filtering).
- pgTAP files follow `supabase/tests/database/guard_protected_write_columns.test.sql` (fixtures as owner, `SET LOCAL ROLE authenticated`, `request.jwt.claims`). Assert row state/counts after the statement; `lives_ok` alone accepts `UPDATE 0`.
- Bug-proof tests land in step 3 before the fixes and are flipped by the fixing step, so the diff shows each bug turning green.
- A real concurrency test (two sessions) is only needed if the RPC option is chosen; the conditional UPDATE is covered by a sequential "second decision gets 0 rows" test.

---

## 6. Migration and deploy notes

Facts: `deploy-db.yml` pushes migrations on push to `develop` (staging) and `main` (production; the `production` Environment requires manual approval). It does not wait for `ci.yml`. Vercel deploys the app on merge, so on `main` the app ships before the DB migration is approved.

| Migration | Compatible with currently deployed code? | Order |
|---|---|---|
| Step 10 `subsidy_items_delete_own_pending` (additive) | Yes; makes the deployed delete start working | any |
| Step 11 self-approval/creator guard (restrictive) | Yes for all UI flows today: deployed `createTransaction` inserts `pending` with `created_by = auth.uid()` (`app/actions.ts:218-237`); deployed `updateTransaction` sends `approval_status` for 会計 even when unchanged, which `IS DISTINCT FROM` allows. It intentionally rejects 会計 self-approval via the edit form (old code shows a generic error) | app (step 6) first, then DB. Natural on `main` because the DB deploy waits for approval |
| Step 12 group rules (restrictive and partly broadening) | Deployed UI only offers groups the new rule allows (`lib/teams.ts:67-100`), except the club group shown to 部長/副部長, which is denied before and after. Direct API misuse is rejected | app (step 7) first; run the production role/group inventory and verify on staging before approving production |
| Option B `approve_transaction` RPC (additive) | Yes by itself; but app code calling it fails until it exists | **DB first**: merge the migration to `main` alone, approve the production DB deploy, then merge the app change. Keep the RPC when rolling the app back |

PR-B implementation (2026-10-24): `20261024100000_guard_transaction_approval_and_filing.sql`
implements steps 11/12 and is compatible with the deployed PR-A app, accounting
role split, and read-only club ledger. The read-only production inventory found
`general` (open), `team` (restricted), and `club` groups; NULL remains open for
app parity. The shared helper grants global non-club filing to admin, 会計, 部長,
and 副部長. Only changed destinations are checked, so historical outsider rows
and unchanged historical self-approvals remain editable. Non-admin API inserts
must start pending under the actor; decisions on other creators record the
actor, and edit-form resets to pending may clear the approver. Admin self-row
break-glass corrections and trusted service/definer writes remain allowed.
Release order: **develop → main**. Verify staging first; the **production DB
deploy requires approval**. No additional app rollout prerequisite remains
because PR-A and the accounting/club changes are already live. This local
implementation does not apply migrations to production.

Rollback: steps 10-12 have down scripts in their headers (as in `20261022120000_…sql:30-38`); reverting 11/12 reopens the bugs, so prefer roll-forward. Types must be regenerated in every migration commit, or CI fails after step 1.

---

## 7. User decisions needed

| # | Decision | Recommendation | Why it matters |
|---|---|---|---|
| D1 | Who approves expense transactions: (A) admin + 会計, (B) also the group leader, (C) admin + leader as the server does today | **A** (spec `specification.md:63,123`, UI, beta checklists) | B needs the SECURITY DEFINER RPC and a two-phase release; C would remove 会計, who is currently shown the buttons |
| D2 | Self-approval: block for everyone in the normal flow, with the admin edit-form correction kept as a logged break-glass path | Yes | Spec only names 会計; the code already blocks everyone in the normal flow |
| D3 | Direct status change in the edit form: admin only (spec `:70`) or admin + 会計 (code today), in both cases never on own rows | admin + 会計 minus own rows (behaviour-preserving); admin-only if you follow the spec strictly | Changes what 会計 sees in `admin-fields.tsx:95` |
| D4 | Budget edit: admin always; 会計 current FY only; leaders never | Yes | Fixes R5; adds the server-side past-year guard |
| D5 | Include DB fixes for the group rule (insert-policy tautology + destination check) in this package | Yes, released last after a production role/group inventory | Without it, item 4 is app-only and the direct Data API bypass stays |
| D6 | Leaders editing other members' transactions | Remove (spec `:62,124`: own pending, admin/会計); it never worked (RLS) | Removes a dead, misleading permission |
| D7 | Approvals on past fiscal years | Follow the ledger read-only rule (admin only for past years) | Approval controls currently ignore it |
| D8 | Include step 13 (member update/retire silent failures) in P1-1 | Yes as a separate commit, or a follow-up PR right after | Non-admin managers can leave profiles/Auth/roles inconsistent today |
| D9 | Approval RPC now (Codex) or in R6 (this plan) | R6 | See §3.5 |

---

## 8. Risks

- **Spec source is git-ignored** (`.gitignore:48` `/docs/*`). Decisions D1-D7 rely on the local `docs/specification.md`; record the outcome in `.claude/docs/DESIGN.md` or `docs/manual/` so it is versioned.
- **Behaviour change for 会計 and leaders** (D1, D4, D6): 会計 gains approval and budget edit; leaders lose permissions they never effectively had. Announce to users.
- **Restrictive DB migrations** (steps 11, 12) can break legacy rows or unexpected role combinations. Mitigation: change-specific checks, the production inventory, staging verification, and pgTAP matrices.
- **Client bundle boundary**: the sidebar imports the pure modules; an accidental import of `access.ts`/`next/headers` breaks the build. Mitigation: `import "server-only"` in `access.ts`, `npm run build` in every step.
- **Hard drift check** makes every schema commit regenerate types; a CLI bump can change output. Mitigation: equal pins in `ci.yml` and `deploy-db.yml`, raw generator output, LF rule.
- **Audit trail stays best-effort**: `logAuditEvent` swallows failures and users can insert self-attributed audit rows. Do not describe the audit log as trustworthy until R6.
- **Group confidentiality is app-only**: `canViewGroup` does not protect reads through the Data API.
- **Production false approvals**: possible only through direct action calls; run the read-only `audit_logs` query in §2.5 before closing the issue.

## 9. Codex consult

`python3 .claude/skills/_shared/codex_consult.py --prompt-file .claude/logs/p1-plan-codex-prompt.md --sandbox read-only --caller general-purpose-opus --label p1-plan` → ok (gpt-6.1-sol, 403 s, no edits). Response: `.claude/logs/codex/20261022T104917Z-p1-plan.md`. Adopted: module boundaries and `server-only` placement, role-lookup error propagation, club precedence and real group type, trigger hardening scope (INSERT, `created_by` immutability, OLD/NEW ownership, `IS DISTINCT FROM`), DB-side destination check, server-side FY for budgets, exact-row semantics per operation, member-manage findings (verified against `members/manage/actions.ts:244-254,333-363` and the profile/user_roles policies). Disagreements:

1. Approval RPC now → deferred to R6 (§3.5).
2. "The checked-in types file has CRLF endings" → the index is LF; only the local working copy is CRLF (`git ls-files --eol`). The `.gitattributes` rule is still added.
3. "Use CLI 2.120.0 rather than 2.121.0" → verified byte-identical output today; keep pins equal, either version works for now.
4. DB group fix "in P1-1" unconditionally → included, but gated by D5 and the production inventory.

Codex could not run Vitest in its sandbox; all runtime evidence in §2 comes from this agent's local reproductions.

## 10. Decisions (user, 2026-10-22)

- D1: **A** — approvers are admin + 会計; leaders cannot approve.
- D2: yes — self-approval blocked for everyone; admin edit-form correction kept as a logged break-glass path.
- D3: admin + 会計 may change status directly in the edit form, never on their own rows.
- D4: budget edit = admin always, 会計 current fiscal year only, leaders never.
- D5: include the DB group-rule fix; release it last, after a read-only production role/group inventory.
- D6: remove leader editing of other members' transactions.
- D7: approvals on past fiscal years are admin-only.
- D8: include step 13 as a separate commit.
- D9: approval RPC deferred to R6.

Release split: PR-A = steps 1–10 and 13 (app + additive migration only). PR-B = steps 11–12 (restrictive migrations), merged and DB-approved only after PR-A's app is live in production.

Amendment (user, 2026-10-22): in the edit form, a global admin may change approval status on their OWN transactions (break-glass), and every such change must be written to audit_logs. 会計 may not change status on their own rows. The normal approval action still blocks self-approval for everyone. The step 11 self-approval guard must allow this admin path.

### Clarification (user, 2026-10-22, during PR-A)

- In the edit form, a global admin MAY change approval fields (`approval_status`, `approved_by`) on their own
  transactions. This is the break-glass correction path. Every such change writes an `audit_logs` row with the
  old and new values, the actor, and an explicit marker (`break_glass: "admin_self_row_correction"`), and the
  change is not reported as success when that audit row cannot be written.
- 会計 (non-admin) still may not change approval fields on their own rows.
- The normal approval action (`updateTransactionStatus`) blocks self-approval for everyone, admin included.
- Step 11 (PR-B) must keep this admin path working: the self-approval / creator guard applies to non-admin
  Data API writers only (the `is_admin()` exemption stays), so an admin's own-row correction is not blocked by
  the trigger. Its pgTAP suite must include "admin changes approval_status on own row → allowed".
