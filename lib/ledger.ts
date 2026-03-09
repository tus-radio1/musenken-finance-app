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
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  return combinedRows;
}
