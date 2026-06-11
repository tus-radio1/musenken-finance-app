"use client";

/**
 * 支援金申請一覧: フィルタ・検索バー
 * 種別・収支区分・会計区分・状態のフィルタと項目名検索を提供する。
 */

import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS } from "@/lib/constants/subsidy";

type AccountingGroup = { id: string; name: string };

type ItemsFilterBarProps = {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  incomeTypeFilter: string;
  onIncomeTypeFilterChange: (incomeType: string) => void;
  accountingGroupFilter: string;
  onAccountingGroupFilterChange: (group: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  accountingGroups: AccountingGroup[];
};

export function ItemsFilterBar({
  searchQuery,
  onSearchQueryChange,
  categoryFilter,
  onCategoryFilterChange,
  incomeTypeFilter,
  onIncomeTypeFilterChange,
  accountingGroupFilter,
  onAccountingGroupFilterChange,
  statusFilter,
  onStatusFilterChange,
  accountingGroups,
}: ItemsFilterBarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="概要で検索..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="種別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての種別</SelectItem>
            <SelectItem value="activity">活動支援金</SelectItem>
            <SelectItem value="league">連盟登録支援金</SelectItem>
            <SelectItem value="special">特別支援金</SelectItem>
          </SelectContent>
        </Select>
        <Select value={incomeTypeFilter} onValueChange={onIncomeTypeFilterChange}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="支出・収入" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">支出・収入</SelectItem>
            <SelectItem value="expense">支出</SelectItem>
            <SelectItem value="income">収入</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountingGroupFilter} onValueChange={onAccountingGroupFilterChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="会計区分" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての会計区分</SelectItem>
            {accountingGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="状態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての状態</SelectItem>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
