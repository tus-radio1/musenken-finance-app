/**
 * 操作ごとの権限判定（純粋関数）。
 *
 * すべての判定はここに集約し、Server Action・ページ・クライアントコンポーネントは
 * この関数を呼ぶ。サイドバーなどブラウザからも使うため server-only にしない。
 *
 * ロールの判定方法は DB の関数と揃える:
 *   - 管理者: roles.type = "admin"（is_admin()）
 *   - 会計: roles.name = "会計"（has_role('会計')）
 *   - 部長・副部長: roles.name
 * 部全体会計（type = "club"）の判定は他より先に行い、部長・副部長には
 * 部全体会計の権限を与えない。
 */

import { GROUP_TYPES, ROLE_NAMES_JA } from "./constants";
import type { RoleAccessContext } from "./types";

/** Minimal shape of an accounting group needed for permission checks. */
export type GroupRef = { id: string; type: string | null };

/** Minimal shape of a transaction needed for permission checks. */
export type TransactionRef = {
  created_by: string;
  approval_status: string | null;
};

const PENDING = "pending";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export function isAdmin(access: RoleAccessContext): boolean {
  return access.isAdmin;
}

export function isAccounting(access: RoleAccessContext): boolean {
  return access.hasAccountingRole;
}

export function isAdminOrAccounting(access: RoleAccessContext): boolean {
  return access.isAdmin || access.hasAccountingRole;
}

/** 管理者・会計・部長・副部長は部全体会計以外の全グループを扱える。 */
export function hasAllNonClubGroupAccess(access: RoleAccessContext): boolean {
  return (
    isAdminOrAccounting(access) ||
    access.roles.some(
      (r) =>
        r.name === ROLE_NAMES_JA.CHAIR || r.name === ROLE_NAMES_JA.VICE_CHAIR,
    )
  );
}

export function hasRoleInGroup(
  access: RoleAccessContext,
  accountingGroupId: string,
): boolean {
  return access.roles.some((r) => r.accountingGroupId === accountingGroupId);
}

// ---------------------------------------------------------------------------
// Accounting groups
// ---------------------------------------------------------------------------

export function isClubGroup(group: Pick<GroupRef, "type">): boolean {
  return group.type === GROUP_TYPES.CLUB;
}

/** type が general または未設定のグループは全員に公開する。 */
export function isOpenGroup(group: Pick<GroupRef, "type">): boolean {
  return group.type === GROUP_TYPES.GENERAL || group.type === null;
}

function canUseGroup(
  access: RoleAccessContext,
  group: GroupRef | null | undefined,
): boolean {
  if (!group) return false;
  if (isClubGroup(group)) return isAdminOrAccounting(access);
  return (
    hasAllNonClubGroupAccess(access) ||
    isOpenGroup(group) ||
    hasRoleInGroup(access, group.id)
  );
}

/** 出納帳・グループ一覧の表示可否（アプリ側の判定。DB の SELECT は別）。 */
export function canViewGroup(
  access: RoleAccessContext,
  group: GroupRef | null | undefined,
): boolean {
  return canUseGroup(access, group);
}

/** 取引をこのグループに登録・移動できるか。見つからないグループは不可。 */
export function canFileTransactionInGroup(
  access: RoleAccessContext,
  group: GroupRef | null | undefined,
): boolean {
  return canUseGroup(access, group);
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export type ApprovalDenialReason =
  | "forbidden"
  | "own_transaction"
  | "not_pending"
  | "past_fiscal_year";

export type ApprovalCheck =
  | { ok: true }
  | { ok: false; reason: ApprovalDenialReason };

/**
 * 通常の承認・却下（pending → approved / rejected）。
 * 承認者は管理者と会計のみ。自分の申請は誰も承認できない（管理者を含む）。
 * 過年度の取引は管理者のみ。
 */
export function checkTransactionApproval(
  access: RoleAccessContext,
  tx: TransactionRef,
  actorId: string,
  isCurrentFiscalYear: boolean,
): ApprovalCheck {
  if (!isAdminOrAccounting(access)) return { ok: false, reason: "forbidden" };
  if (tx.created_by === actorId) return { ok: false, reason: "own_transaction" };
  if (tx.approval_status !== PENDING) return { ok: false, reason: "not_pending" };
  if (!access.isAdmin && !isCurrentFiscalYear) {
    return { ok: false, reason: "past_fiscal_year" };
  }
  return { ok: true };
}

export function canApproveTransaction(
  access: RoleAccessContext,
  tx: TransactionRef,
  actorId: string,
  isCurrentFiscalYear: boolean,
): boolean {
  return checkTransactionApproval(access, tx, actorId, isCurrentFiscalYear).ok;
}

/** 編集フォームを開けるか: 管理者・会計、または pending の自分の取引。 */
export function canEditTransaction(
  access: RoleAccessContext,
  tx: TransactionRef,
  actorId: string,
): boolean {
  if (isAdminOrAccounting(access)) return true;
  return tx.created_by === actorId && tx.approval_status === PENDING;
}

/**
 * 編集フォームから承認項目（approval_status / approved_by / approved_at /
 * rejected_reason）を直接変更できるか。
 *   - 管理者: 常に可。自分の取引の場合は監査ログ必須の break-glass 修正。
 *   - 会計: 自分の取引以外、かつ現年度のみ。
 */
export function canSetApprovalFieldsDirectly(
  access: RoleAccessContext,
  params: { isOwnRow: boolean; isCurrentFiscalYear: boolean },
): boolean {
  if (access.isAdmin) return true;
  return (
    access.hasAccountingRole && !params.isOwnRow && params.isCurrentFiscalYear
  );
}

/** 申請者・承認者の付け替えは管理者のみ。 */
export function canReassignTransactionPeople(access: RoleAccessContext): boolean {
  return access.isAdmin;
}

/** 削除: 管理者は常に可、作成者は pending のみ。 */
export function canDeleteTransaction(
  access: RoleAccessContext,
  tx: TransactionRef,
  actorId: string,
): boolean {
  if (access.isAdmin) return true;
  return tx.created_by === actorId && tx.approval_status === PENDING;
}

// ---------------------------------------------------------------------------
// Budgets and groups
// ---------------------------------------------------------------------------

/** 予算管理ページを開けるか。 */
export function canViewBudgetPage(access: RoleAccessContext): boolean {
  return isAdminOrAccounting(access);
}

/** 予算の編集: 管理者は常に可、会計は現年度のみ、班長は不可。 */
export function canEditBudget(
  access: RoleAccessContext,
  fiscalYear: { isCurrent: boolean },
): boolean {
  if (access.isAdmin) return true;
  return access.hasAccountingRole && fiscalYear.isCurrent;
}

export function canCreateFiscalYear(access: RoleAccessContext): boolean {
  return isAdminOrAccounting(access);
}

/** グループの作成・有効化切り替え・年度データ削除。 */
export function canManageGroups(access: RoleAccessContext): boolean {
  return access.isAdmin;
}

// ---------------------------------------------------------------------------
// Subsidies, members, club ledger
// ---------------------------------------------------------------------------

export function canManageSubsidies(access: RoleAccessContext): boolean {
  return isAdminOrAccounting(access);
}

/** 補助金申請の論理削除（RLS 上、deleted_at を設定できるのは管理者のみ）。 */
export function canSoftDeleteSubsidyItems(access: RoleAccessContext): boolean {
  return access.isAdmin;
}

export function canManageMembers(access: RoleAccessContext): boolean {
  return access.canManageMembers;
}

/** 部全体会計の閲覧: 会計と管理者のみ。 */
export function canViewClubLedger(access: RoleAccessContext): boolean {
  return isAdminOrAccounting(access);
}

/** 部全体会計の取引作成・編集、資金移動: 会計と管理者のみ。 */
export function canCreateClubTransaction(access: RoleAccessContext): boolean {
  return isAdminOrAccounting(access);
}

/** 財布マスタの管理: 管理者のみ。 */
export function canManageFinancialAccounts(access: RoleAccessContext): boolean {
  return access.isAdmin;
}
