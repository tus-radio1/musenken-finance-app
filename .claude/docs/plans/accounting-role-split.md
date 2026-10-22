# Accounting role split

Audit date: 2026-10-22. Base: develop `a81bff8`.

## Decision and scope

Production has two holders of the global `会計` role with `type = 'admin'`.
One also holds `Admin`; that user's admin access must survive. The other must
become an accountant without global administration. Keep `is_admin()` and
`buildRoleAccess()` type-based; fix the role data rather than special-casing
the name in either admin detector. All accounting grants use the name `会計`.

Classification: **A** keep admin-only (no new grant without a decision),
**B** explicitly grant to accounting under the two user decisions,
**C** already available to accounting by name. Ordinary authenticated/owner
rights are also preserved. The inventory below covers all migrations, including
superseded definitions, plus every direct admin check in app/ and components/.

## SQL inventory

Paths below are relative to `supabase/migrations/`.

| Migration / object | Class | Result / reason |
| --- | --- | --- |
| `20260320100100_add_rls_policies.sql`: `is_admin()` | A | Global admin remains any assigned role with type admin. Migration B fixes only the global accounting role. |
| Same: `has_role(text)` | C | Name-based accounting detection does not depend on type. |
| Same: `profiles_admin_all` | A | Arbitrary profile insert/update/delete remains admin-only; own-profile policy and authorized member-management service actions remain. |
| Same: `transactions_update_admin_accounting` | C | Existing non-deleted row updates already name accounting. The implicit WITH CHECK prevents soft delete. |
| Same: `transactions_admin_all` | A/B | Keep broad ALL admin-only (including deleted-row access and restoration). Add a separate DELETE grant for accounting, including other owners and approved rows (B). |
| Same: `subsidy_items_update_admin_accounting` | C/B | Existing ordinary updates name accounting (C); allow the updated row's deleted_at to be non-null (B). Keep old-row restriction and avoid a broad ALL grant. |
| Same: `subsidy_items_admin_all` | A | Arbitrary insert, hard-delete, deleted-row visibility/restoration remain admin-only. Accounting soft delete uses the UPDATE policy above. |
| Same: `user_roles_admin_all`, `roles_admin_all` | A | Direct assignment and role-definition writes stay admin-only; S1 still protects officer roles in service actions. |
| Same: `accounting_groups_admin_all` | A/B | Keep ALL admin-only. Add accounting INSERT and UPDATE only (B): group creation and activation. No DELETE: cascading deletion would remove budgets and roles/assignments. |
| `20260320100200_add_audit_log.sql`: `audit_logs_select_admin` | A | Other actors' audit history remains admin-only; own history/own insert remains available. |
| `20260320100300_add_system_config.sql`: `system_config_admin_all` | A | System configuration writes remain admin-only; authenticated reads remain. |
| `20260612120000_add_club_wide_ledger.sql`: `financial_accounts_admin_all` | A | Wallet-master INSERT/UPDATE/DELETE stays admin-only. |
| Same: `is_accounting_or_admin()` | C | Existing helper explicitly combines is_admin() and has_role('会計'); reuse it for the new policies. |
| Same: `create_transfer()` | C | Already uses is_accounting_or_admin(); authenticated identity remains authoritative. |
| Same: historical `transactions_select_non_deleted` | C | Already names accounting through helper; superseded by 20261022150000 below. |
| Same: `transactions_insert_member` club branch | C | Club creation already names accounting through helper. Non-club group bug remains PR-B. |
| `20261022120000_guard_protected_write_columns.sql`: `is_restricted_api_writer()` and both guard triggers | C | Accounting already exempt by name. Leave functions, triggers and create_transfer EXECUTE grants intact. |
| `20261022150000_club_ledger_readonly_for_bucho.sql`: `can_view_club_ledger()` / replacement SELECT | C | Accounting already named alongside admin, 部長 and 副部長. |
| Same: restrictive `transactions_update_club_writers_only`, `transactions_delete_club_writers_only` | C | Accounting already named on USING and UPDATE WITH CHECK; DELETE still needs a permissive policy (Migration A). |
| Initial schema: budgets SELECT; `20260307151000_add_fiscal_years_policy.sql`: fiscal-years SELECT | C (independent of role) | Both reads already work for accounting in every year. No budget write policies exist, even for admins. App budget writes use the service role after D4 checks. |
| Fiscal-year creation | C (app); B (DB) | App canCreateFiscalYear already names accounting; add INSERT only for admin/accounting in Migration A. No existing UI updates/deletes fiscal-year metadata; do not invent those grants. |

Other migrations contain no admin gate. `roles.type` is unconstrained TEXT in
`00000000000000_initial_schema.sql`; no subsequent migration adds a CHECK,
domain or enum on it. Thus `accounting` needs no schema/constraint change.
The pgTAP schema assertion verifies this on the migrated local database.

### Storage

`20260325120000_add_storage_policies.sql` permitted authenticated receipt
INSERT in the owner's prefix and SELECT; neither policy used admin.
`20261022130000_make_receipts_bucket_private.sql` drops both policies and aborts
if any unreviewed object policy remains. No direct Storage API rights exist for
admin or accounting now. Upload/read/cleanup go through existing authorized
server actions and service-role signing; their accounting bypass is already
name-based. No storage change is required.

## Application inventory

| Location / gate | Class | Result |
| --- | --- | --- |
| `lib/roles/parse.ts`: buildRoleAccess | A/C | isAdmin remains type-based; hasAccountingRole and member management remain name-based. |
| `lib/roles/permissions.ts`: isAdmin, canReassignTransactionPeople, canManageFinancialAccounts | A | Remain admin-only. |
| Same: checkTransactionApproval / canApproveTransaction past-year exception; canSetApprovalFieldsDirectly own-row/past-year exception; canEditBudget past-year exception | A | D4/D7 and break-glass boundaries unchanged. No self-approval via normal approval, including admins. |
| Same: canDeleteTransaction, row canDelete, canSoftDeleteSubsidyItems, canManageGroups | B | Use isAdminOrAccounting (hasAccountingRole by name). Owner pending-delete fallback remains. Read-only ledger context still suppresses row actions. |
| Same: isAccounting, isAdminOrAccounting, hasAllNonClubGroupAccess, canUseGroup, canViewGroup, canFileTransactionInGroup, canEditTransaction, canViewBudgetPage, canCreateFiscalYear, canManageSubsidies, canManageMembers, canViewClubLedger, canCreateClubTransaction | C | Already names accounting, directly or through parsed context/helper. |
| `app/actions.ts`: updateTransactionStatus and updateTransaction admin fiscal-year bypass; past-year move gate; self-row audit marker | A | Preserve D7 and break-glass, reassignments via predicate stay admin-only. Upload authorization already names accounting (C). deleteTransaction uses widened predicate (B). |
| `app/(authenticated)/budget/page.tsx`: group buttons | B | Replace admin checks with canManageGroups; couple any budget-affecting button to canEditBudget. Fiscal-year creation uses canCreateFiscalYear independently of selected year (C). |
| Same: past-year banner and budget editor | A | Still read-only for accounting's past-year budgets. |
| `app/(authenticated)/budget/actions.ts`: toggle/create/deleteGroupYearData | B | Widen canManageGroups; before any service write, check stored fiscal year on operations that insert/delete a budget (D4). Creating a new fiscal year with initial budgets remains C. |
| `app/(authenticated)/ledger/page.tsx`: isGlobalAdmin / past-year read-only; `components/ledger-view.tsx`: isGlobalAdmin / userRoleStr | A/C | Preserve existing past-year read-only UI; correct accounting editor variant follows name (C). Deletion of approved/other-owner rows is available in current-year ledger (B); server deletion has no year restriction. |
| `components/ledger/ledger-desktop-table.tsx`, `ledger-mobile-cards.tsx` | B/C | Row flags use central widened deletion predicate (B); editor selection already uses isAdminOrAccounting (C). |
| `app/(authenticated)/applications/page.tsx`, `components/applications-table.tsx`: isGlobalAdmin | B/C | Own-row edit/delete controls must include accounting by name, consistent with canEditTransaction/canDeleteTransaction; no approval or reassignment bypass. |
| `components/transaction/admin-fields.tsx`: userRole admin creator/approver selectors | A | Keep creator/approver reassignment admin-only. |
| `app/(authenticated)/members/manage/page.tsx`, `actions.ts` (planRoleSync, retireMember, deleteMember); `manage-members-client.tsx`: isAdmin | A | Officer assignment/removal, protected target operations, force-reset password remain admin-only. Non-admin member management stays available by name (C). |
| `app/(authenticated)/admin/actions.ts`, `admin/create-user.ts`; member manage forceResetPassword via verifyAdmin | A | Global/group role administration, new user and credential administration remain admin-only. |
| `app/(authenticated)/subsidies/page.tsx`, `components/subsidy-items-table.tsx`, `components/subsidy/items-desktop-table.tsx`, `items-mobile-card-list.tsx`: isGlobalAdmin | A | Applicant-facing edit/hard-delete overrides stay admin-only. Management soft-delete is a separate authorized path (B). |
| `app/(authenticated)/subsidies/actions.ts`: deleteMySubsidyItem actorIsAdmin | A | Hard-delete someone else's or non-pending item remains admin-only; accounting uses management soft-delete (B). |
| `app/(authenticated)/subsidies/manage/actions.ts`: isAdmin response, linked-transaction unexecuted guard | A | Past-year management and marking linked subsidies unexecuted remain admin-only pending decision. deleteSubsidyItem uses widened predicate (B), exact affected count without RETURNING to avoid granting deleted-row SELECT. |
| `app/(authenticated)/subsidies/manage/page.tsx`, `client-page.tsx`, `_components/manage-edit-dialog.tsx`: isAdmin | A | Past-year read-only / justification display behavior stays. Soft-delete button already appears to management users (B). |

## Non-Admin accounting user after deployment

| Capability | Allowed? | Boundary |
| --- | --- | --- |
| View every ledger, club ledger and budgets, including past years | Yes | Name-based access; budget SELECT and page gate tested. |
| Create/edit transactions; transfers; manage subsidy items | Yes | Existing PR-A rights, club included. |
| Delete other members' transactions, including approved rows | Yes | Explicit DELETE policy; current-year ledger exposes controls; existing past-year read-only UI remains. |
| Soft-delete subsidy items | Yes | Management action; no hard-delete or deleted-row read grant. |
| Create/activate/deactivate accounting groups | Yes | No physical group DELETE / cascade rights. |
| Delete group/year data and initialize a group's budget | Current year only | These mutate budgets, so D4 applies before any write. |
| Create fiscal years and their initial budgets | Yes | Existing app flow; explicit fiscal-year INSERT RLS. |
| Edit/delete existing past-year budgets; approve past-year transactions | No | D4/D7 remain in app. |
| Edit wallet masters | No | App predicate and all three DB writes denied. |
| Change own-row approval status via break-glass | No | Normal self-approval also denied in app. |
| Reassign transaction creator or approver | No | App predicate remains admin-only. |
| Appoint/remove officer roles or edit role definitions directly | No | S1 remains fail-closed; direct role RLS remains admin-only. |
| Arbitrary profile writes, all-actor audit history, config/user/password administration | No | Unchosen admin-only privileges are not widened. |

The Admin + accounting user retains admin rights through their separate Admin
assignment, including D4/D7 and break-glass exceptions, wallet and officer-role
administration. Normal self-approval remains disallowed for everyone.

## Deployment and validation

1. Apply Migration A (additive DELETE, group INSERT/UPDATE, fiscal-year INSERT;
   adjust accounting subsidy UPDATE WITH CHECK), then deploy the app.
2. Apply Migration B last: idempotent UPDATE scoped to global 会計/admin only.
   Existing local/staging accounting rows are unchanged; Admin rows and all
   user_roles links are unchanged. Re-running it is a no-op.
3. App before A can temporarily encounter RLS errors for the new rights on
   already-non-admin environments; no admin escalation. B before app/A removes
   admin safely but temporarily denies the intended extra operations. Do not
   claim that reversed order preserves availability. A and app before B avoids
   that gap. Reverting the app does not restore admin; prefer roll-forward.

Tests cover the actual migration B through a psql include inside a rollback-only
fixture transaction, retain the dual-role admin, exercise RLS writes and denied
wallet writes, and verify past-year budget reads. Keep all six existing PR-B
TODO assertions untouched. D4/D7, own-row status changes and reassignments are
application boundaries; existing direct-API gaps (including accounting's guard
exemption) are not fixed here. The 20261022120000 guards stay byte-for-byte intact.

## Open questions (no new permissions granted)

- Should accounting also mark a subsidy unexecuted when linked transactions
  exist? Deletion was chosen, but this coupled status workflow was not.
- Should accounting manage past-year subsidy records or receive past-year
  ledger write controls beyond the existing server deletion endpoint?
- Should accounting receive broader profile/audit/config/user administration?
  These remain admin-only. Physical group deletion and fiscal-year metadata
  update/deletion have no existing authorized app workflow and stay ungranted.
