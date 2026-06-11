"use client";

/**
 * 出納帳のフィルタバー（テキスト検索・ステータスフィルタ・件数表示）。
 */

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  loading: boolean;
  filteredCount: number;
  totalCount: number;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  filterStatus: string;
  onFilterStatusChange: (status: string) => void;
};

export function LedgerFilterBar({
  loading,
  filteredCount,
  totalCount,
  filterText,
  onFilterTextChange,
  filterStatus,
  onFilterStatusChange,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
      <div className="text-sm text-muted-foreground">
        {loading
          ? "読み込み中..."
          : `${filteredCount}件${filteredCount !== totalCount ? ` / ${totalCount}件中` : ""}`}
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <Input
          placeholder="検索..."
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          className="h-8 w-full sm:w-48"
        />
        {/* 将来拡張(部全体会計): ステータスフィルタの前に財布フィルタ (金庫/銀行口座/全財布)
            と種別フィルタ (収入/支出/資金移動) の Select を追加する。
            Props に onFilterAccountChange / onFilterKindChange を追加し、
            LedgerView 側で useMemo のフィルタ条件に組み込む。
            cf. docs/club-wide-ledger-spec.md */}
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
