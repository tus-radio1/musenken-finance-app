/**
 * 出納帳の集計・統合ロジック。
 *
 * 現在は amount の正負のみで income / expense を判定しているが、
 * 将来仕様 (docs/club-wide-ledger-spec.md — 部全体会計・財布別記録) で
 * 以下のフィールドが transactions テーブルに追加される予定:
 *   - transaction_kind: "income" | "expense" | "transfer"
 *   - financial_account_id: 財布 (金庫 / 銀行口座) の外部キー
 *
 * その際は AggregateOptions に渡すだけで既存の呼び出し元を変更せずに
 * フィルタ・集計を拡張できる設計にしている。
 * calculateIncomeTotal / calculateExpenseTotal が拡張の主な接点となる。
 */

import { getSortableDateValue } from "@/lib/date";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type TransactionRow = {
  id: string;
  date: string | null;
  amount: number;
  description: string | null;
  accounting_group_id: string | null;
  approval_status: string | null;
  receipt_url: string | null;
  created_by: string | null;
  approved_by: string | null;
  rejected_reason: string | null;
  remarks: string | null;
  is_subsidy?: boolean;
  subsidy_id?: string;
  subsidy_item_id?: string | null;
  financial_account_id?: string | null;
  financial_account_name?: string | null;
  transaction_kind?: string | null;
  transfer_id?: string | null;
};

/**
 * 出納帳の表示行。TransactionRow をプロフィール名・領収書URL等で拡張したもの。
 * LedgerView が受け取る初期データの個別行の型として使用する。
 */
export type LedgerTransaction = {
  id: string;
  date: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  description: string | null;
  amount: number;
  receipt_public_url?: string | null;
  approval_status: string | null;
  approved_by_name?: string | null;
  rejected_reason?: string | null;
  remarks?: string | null;
  is_subsidy?: boolean;
  subsidy_id?: string;
  accounting_group_id?: string | null;
  receipt_url?: string | null;
  approved_by?: string | null;
  financial_account_id?: string | null;
  financial_account_name?: string | null;
  transaction_kind?: string | null;
  transfer_id?: string | null;
};

/**
 * fetchLedgerTransactions が成功時に返すデータ構造。
 * LedgerView の initialData props として受け渡す。
 */
export type LedgerInitialData = {
  data: LedgerTransaction[];
  budgetAmount: number;
  carryoverAmount: number;
};

export type SubsidyItemData = {
  id: string;
  name: string;
  requested_amount: number;
  approved_amount: number;
  actual_amount: number;
  created_at: string;
  applicant_id: string;
  receipt_date: string | null;
  status: string;
  accounting_group_id?: string | null;
};

/**
 * transaction と subsidy_item を受け取り、
 * 支援金充当分を除外した通常の取引と、支援金の実質負担額・受領額を結合・計算した
 * 統合された Ledger 用の行データ一覧を返します。
 */
export function synthesizeLedgerRows(
  txRows: TransactionRow[],
  subsidyData: SubsidyItemData[],
  requestedGroupId?: string | null,
): TransactionRow[] {
  const processedSubsidyIds = new Set(subsidyData?.map((s) => s.id) || []);

  // 支援金(処理済)に紐づく生のtransactionsを除外（支援金の仮想行を優先表示するため）
  const filteredTxRows = txRows.filter(
    (tx) => !tx.subsidy_item_id || !processedSubsidyIds.has(tx.subsidy_item_id),
  );

  // 支援金データを仮想の TransactionRow に変換
  const subsidyRows: TransactionRow[] = [];
  if (subsidyData && subsidyData.length > 0) {
    subsidyData.forEach((item) => {
      const actualExpense = item.actual_amount || 0;
      const approvedAmount = item.approved_amount || 0;

      const relatedTx = txRows.find((tx) => tx.subsidy_item_id === item.id);
      const receiptUrl = relatedTx ? relatedTx.receipt_url : null;

      // 引数に requestedGroupId がない場合は item の accounting_group_id 等を見るか、そもそもすべてに対して行う。
      // 引数の requestedGroupId が undefined/null であれば fallback として null を入れる。
      const groupId =
        requestedGroupId ||
        relatedTx?.accounting_group_id ||
        item.accounting_group_id ||
        null;

      if (actualExpense > 0) {
        subsidyRows.push({
          id: `subsidy-expense-${item.id}`,
          date: item.created_at,
          amount: -actualExpense,
          description: `[支援金支出] ${item.name}`,
          accounting_group_id: groupId,
          approval_status: "refunded",
          receipt_url: receiptUrl,
          created_by: item.applicant_id,
          approved_by: null,
          rejected_reason: null,
          remarks: "支援金対象の支出",
          is_subsidy: true,
          subsidy_id: item.id,
        });
      }

      if (approvedAmount > 0) {
        subsidyRows.push({
          id: `subsidy-income-${item.id}`,
          date: item.receipt_date || item.created_at,
          amount: approvedAmount,
          description: `[支援金収入] ${item.name}`,
          accounting_group_id: groupId,
          approval_status: item.status === "paid" ? "refunded" : "approved",
          receipt_url: receiptUrl,
          created_by: item.applicant_id,
          approved_by: null,
          rejected_reason: null,
          remarks:
            item.status === "paid"
              ? "支援金として受領済"
              : "支援金として承認済（未受領）",
          is_subsidy: true,
          subsidy_id: item.id,
        });
      }
    });
  }

  // TransactionRow と 仮想行 を結合
  const combinedRows = [...filteredTxRows, ...subsidyRows];

  // 日付で降順ソート
  combinedRows.sort((a, b) => {
    const dateA = getSortableDateValue(a.date);
    const dateB = getSortableDateValue(b.date);
    return dateB - dateA;
  });

  return combinedRows;
}

// ---------------------------------------------------------------------------
// 集計ヘルパー
//
// 将来 transaction_kind (income / expense / transfer) や
// financial_account_id によるフィルタが追加されても、options を拡張するだけで
// 呼び出し元を変更せずに済むシグネチャ設計にしている。
// 現時点では amount の正負のみで income / expense を判定する。
// ---------------------------------------------------------------------------

/**
 * 集計オプション。
 *
 * 将来仕様で transaction_kind / financial_account_id フィルタが必要になった際に
 * このオプションを拡張する。既存呼び出し側は変更不要。
 */
export type AggregateOptions = {
  /** true にすると transfer 種別の行を集計から除外する（将来用。現在は未使用） */
  excludeTransfers?: boolean;
  /** 指定された financial_account_id の行のみを集計対象とする（将来用。現在は未使用） */
  financialAccountId?: string;
};

type AmountLike = { amount: number; transaction_kind?: string | null; financial_account_id?: string | null; approval_status?: string | null };

/**
 * 集計対象の行を options に基づいてフィルタリングする内部ヘルパー。
 */
function filterForAggregation<T extends AmountLike>(
  rows: readonly T[],
  options?: AggregateOptions,
): T[] {
  let result = rows as T[];
  if (options?.excludeTransfers) {
    result = result.filter((r) => r.transaction_kind !== "transfer");
  }
  if (options?.financialAccountId) {
    const id = options.financialAccountId;
    result = result.filter((r) => r.financial_account_id === id);
  }
  return result;
}

/**
 * 収入合計を計算する。amount >= 0 の行を合算する。
 */
export function calculateIncomeTotal(
  rows: readonly AmountLike[],
  options?: AggregateOptions,
): number {
  const filtered = filterForAggregation(rows, options);
  return filtered.reduce((sum, r) => {
    const amt = Number(r.amount) || 0;
    return amt >= 0 ? sum + amt : sum;
  }, 0);
}

/**
 * 支出合計を計算する。amount < 0 の行を絶対値で合算する。
 */
export function calculateExpenseTotal(
  rows: readonly AmountLike[],
  options?: AggregateOptions,
): number {
  const filtered = filterForAggregation(rows, options);
  return filtered.reduce((sum, r) => {
    const amt = Number(r.amount) || 0;
    return amt < 0 ? sum + Math.abs(amt) : sum;
  }, 0);
}

/**
 * 収入・支出の合計と予算残高をまとめて返す。
 * LedgerView のサマリーカードで使用する。
 */
export function calculateLedgerTotals(
  rows: readonly AmountLike[],
  budgetAmount: number,
  carryoverAmount: number,
  options?: AggregateOptions,
): { income: number; expense: number; budgetRemaining: number } {
  const income = calculateIncomeTotal(rows, options);
  const expense = calculateExpenseTotal(rows, options);
  const budgetRemaining =
    (Number(budgetAmount) || 0) +
    (Number(carryoverAmount) || 0) +
    income -
    expense;
  return { income, expense, budgetRemaining };
}

// ---------------------------------------------------------------------------
// Club-wide ledger summary helpers
// ---------------------------------------------------------------------------

export type FinancialAccountInfo = {
  id: string;
  name: string;
};

export type ClubLedgerSummary = {
  income: number;
  expense: number;
  balance: number;
  transferTotal: number;
  walletBalances: Record<string, number>;
};

/**
 * Calculate the club-wide ledger summary.
 *
 * - income/expense: only approved, non-transfer rows in the current fiscal year
 * - walletBalances: cumulative across all years up to the selected fiscal year
 *   (caller must pass allRows including historical data for balance calculation)
 * - transferTotal: sum of absolute positive amounts of approved transfer rows
 *   in the current fiscal year
 */
export function calculateClubLedgerSummary(
  currentYearRows: readonly AmountLike[],
  allRowsForBalance: readonly AmountLike[],
  financialAccounts: readonly FinancialAccountInfo[],
): ClubLedgerSummary {
  // Income/expense: exclude transfers, only approved rows
  const nonTransferApproved = currentYearRows.filter(
    (r) =>
      r.transaction_kind !== "transfer" &&
      r.approval_status !== "rejected" &&
      r.approval_status !== "pending",
  );
  const income = calculateIncomeTotal(nonTransferApproved);
  const expense = calculateExpenseTotal(nonTransferApproved);
  const balance = income - expense;

  // Transfer total for current year: sum of positive approved transfer amounts
  const transferTotal = currentYearRows
    .filter(
      (r) =>
        r.transaction_kind === "transfer" &&
        r.amount > 0 &&
        r.approval_status !== "rejected" &&
        r.approval_status !== "pending",
    )
    .reduce((sum, r) => sum + r.amount, 0);

  // Wallet balances: cumulative across all rows (all years), approved only
  const walletBalances: Record<string, number> = {};
  for (const fa of financialAccounts) {
    walletBalances[fa.id] = 0;
  }
  for (const r of allRowsForBalance) {
    if (r.approval_status === "rejected" || r.approval_status === "pending") continue;
    const faId = r.financial_account_id;
    if (faId && faId in walletBalances) {
      walletBalances[faId] += Number(r.amount) || 0;
    }
  }

  return { income, expense, balance, transferTotal, walletBalances };
}
