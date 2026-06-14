"use client";

/**
 * 出納帳のフィルタバー（テキスト検索・ステータスフィルタ・財布フィルタ・種別フィルタ・件数表示）。
 */

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FinancialAccountInfo } from "./types";

type Props = {
  loading: boolean;
  filteredCount: number;
  totalCount: number;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  filterStatus: string;
  onFilterStatusChange: (status: string) => void;
  /** Financial accounts for wallet filter. When empty/undefined, the filter is hidden. */
  financialAccounts?: FinancialAccountInfo[];
  filterAccountId?: string;
  onFilterAccountChange?: (accountId: string) => void;
  filterKind?: string;
  onFilterKindChange?: (kind: string) => void;
};

export function LedgerFilterBar({
  loading,
  filteredCount,
  totalCount,
  filterText,
  onFilterTextChange,
  filterStatus,
  onFilterStatusChange,
  financialAccounts,
  filterAccountId,
  onFilterAccountChange,
  filterKind,
  onFilterKindChange,
}: Props) {
  const showAccountFilter =
    financialAccounts && financialAccounts.length > 0 && onFilterAccountChange;
  const showKindFilter = !!onFilterKindChange;

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
      <div className="text-sm text-muted-foreground">
        {loading
          ? "読み込み中..."
          : `${filteredCount}件${filteredCount !== totalCount ? ` / ${totalCount}件中` : ""}`}
      </div>
      <div className="flex gap-2 w-full sm:w-auto flex-wrap">
        <Input
          placeholder="検索..."
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          className="h-8 w-full sm:w-48"
        />
        {showAccountFilter && (
          <Select
            value={filterAccountId || "all"}
            onValueChange={onFilterAccountChange}
          >
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全財布</SelectItem>
              {financialAccounts.map((fa) => (
                <SelectItem key={fa.id} value={fa.id}>
                  {fa.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {showKindFilter && (
          <Select
            value={filterKind || "all"}
            onValueChange={onFilterKindChange}
          >
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全種別</SelectItem>
              <SelectItem value="income">収入</SelectItem>
              <SelectItem value="expense">支出</SelectItem>
              <SelectItem value="transfer">資金移動</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={filterStatus} onValueChange={onFilterStatusChange}>
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="pending">受付中</SelectItem>
            <SelectItem value="accepted">受付済</SelectItem>
            <SelectItem value="receipt_received">領収書受領済</SelectItem>
            <SelectItem value="approved">承認済</SelectItem>
            <SelectItem value="rejected">却下</SelectItem>
            <SelectItem value="received">受領済</SelectItem>
            <SelectItem value="refunded">処理済(確定)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
