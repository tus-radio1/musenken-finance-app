"use server";

/**
 * 出納帳データ取得の Server Action。
 *
 * 権限モデル（lib/roles/permissions.ts の canViewGroup）:
 *   - 部全体会計（type = club）: 管理者・会計・部長・副部長（後者は閲覧のみ）
 *   - それ以外: 管理者・会計・部長・副部長は全グループ、一般部員は
 *     type が general / 未設定のグループと自分が所属するグループのみ
 */

import {
  fetchLedgerTransactionsSchema,
  createTransferSchema,
  validateInput,
} from "@/lib/validations";
import { resolveAuthWithRoles } from "@/lib/auth/context";
import { revalidatePath } from "next/cache";
import { canCreateClubTransaction } from "@/lib/roles/permissions";
import { readLedgerTransactions } from "@/lib/ledger-data";

export async function fetchLedgerTransactions(params: {
  accountingGroupId: string;
  fyYear?: number;
}) {
  const validation = validateInput(fetchLedgerTransactionsSchema, params);
  if (!validation.success) {
    return { error: "入力データが不正です" as const };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

  return readLedgerTransactions(auth, access, params);
}

/**
 * Fetch active financial accounts for form selectors.
 */
export async function fetchFinancialAccounts() {
  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  const { data, error } = await auth.supabase
    .from("financial_accounts")
    .select("id, name, type, is_active, display_order")
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    console.error("[fetchFinancialAccounts] Error:", error);
    return { error: "財布データの取得に失敗しました" as const };
  }

  return { data: data || [] };
}

/**
 * Create a fund transfer (資金移動) between two financial accounts.
 * Atomically inserts 2 transaction rows via the create_transfer RPC.
 * Only accounting staff and admins can create transfers.
 */
export async function createTransfer(params: {
  date: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  description: string;
  receiptUrl?: string | null;
  remarks?: string | null;
}) {
  const validation = validateInput(createTransferSchema, params);
  if (!validation.success) {
    return { error: validation.error };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

  // Only accounting/admin can create transfers
  if (!canCreateClubTransaction(access)) {
    return { error: "資金移動の作成には会計担当または管理者権限が必要です" };
  }

  const { data: transferId, error: rpcError } = await auth.supabase.rpc(
    "create_transfer",
    {
      p_date: params.date,
      p_amount: params.amount,
      p_from_account_id: params.fromAccountId,
      p_to_account_id: params.toAccountId,
      p_description: params.description,
      // Omitted optional RPC arguments fall back to the SQL default (NULL).
      p_receipt_url: params.receiptUrl ?? undefined,
      p_remarks: params.remarks ?? undefined,
      p_created_by: auth.profileId,
    },
  );

  if (rpcError) {
    console.error("[createTransfer] RPC error:", rpcError);
    return { error: "資金移動の作成に失敗しました" };
  }

  revalidatePath("/ledger");
  return { success: true, transferId };
}
