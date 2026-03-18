"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ArrowUpDown, Search, Filter } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Transaction = {
  id: string;
  date: string | null;
  amount: number;
  description: string;
  approval_status: string;
  accounting_group_id?: string;
  accounting_group_name: string;
};

type SortKey = "date" | "amount";
type SortOrder = "asc" | "desc";

export function ApplicationsTable({
  transactions,
  accountingGroups = [],
}: {
  transactions: Transaction[];
  accountingGroups?: { id: string; name: string }[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [incomeTypeFilter, setIncomeTypeFilter] = useState<string>("all");
  const [accountingGroupFilter, setAccountingGroupFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const filtered = useMemo(() => {
    let result = [...transactions];

    // Text search (description only)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((tx) => tx.description.toLowerCase().includes(q));
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((tx) => tx.approval_status === statusFilter);
    }

    // Income/expense filter (based on amount sign)
    if (incomeTypeFilter === "expense") {
      result = result.filter((tx) => tx.amount < 0);
    } else if (incomeTypeFilter === "income") {
      result = result.filter((tx) => tx.amount >= 0);
    }

    // Accounting group filter
    if (accountingGroupFilter !== "all") {
      result = result.filter((tx) => tx.accounting_group_id === accountingGroupFilter);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        cmp = da - db;
      } else if (sortKey === "amount") {
        cmp = Math.abs(a.amount) - Math.abs(b.amount);
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return result;
  }, [transactions, searchQuery, statusFilter, incomeTypeFilter, accountingGroupFilter, sortKey, sortOrder]);



  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
    }).format(amount);

  return (
    <div className="space-y-4">
      {/* フィルタ・検索バー */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="概要で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={incomeTypeFilter} onValueChange={setIncomeTypeFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="支出・収入" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">支出・収入</SelectItem>
              <SelectItem value="expense">支出</SelectItem>
              <SelectItem value="income">収入</SelectItem>
            </SelectContent>
          </Select>
          <Select value={accountingGroupFilter} onValueChange={setAccountingGroupFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="会計区分" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての会計区分</SelectItem>
              {accountingGroups.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="状態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての状態</SelectItem>
              <SelectItem value="pending">受付中</SelectItem>
              <SelectItem value="accepted">受付済</SelectItem>
              <SelectItem value="receipt_received">領収書受領済</SelectItem>
              <SelectItem value="approved">承認済</SelectItem>
              <SelectItem value="rejected">却下</SelectItem>
              <SelectItem value="received">受領済</SelectItem>
              <SelectItem value="refunded">返金済</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* テーブル */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {transactions.length === 0
            ? "まだ申請はありません。"
            : "条件に一致する申請がありません。"}
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 -ml-3 font-medium"
                    onClick={() => toggleSort("date")}
                  >
                    日付
                    <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </TableHead>
                <TableHead>収支</TableHead>
                <TableHead>概要</TableHead>
                <TableHead>会計区分</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 -ml-3 font-medium"
                    onClick={() => toggleSort("amount")}
                  >
                    金額
                    <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </TableHead>
                <TableHead className="w-[100px]">状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-medium">
                    {tx.date ? format(new Date(tx.date), "yyyy/MM/dd") : "-"}
                  </TableCell>
                  <TableCell>
                    {tx.amount < 0 ? (
                      <Badge
                        variant="outline"
                        className="text-red-600 border-red-200"
                      >
                        支出
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-blue-600 border-blue-200"
                      >
                        収入
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className="max-w-[260px] truncate"
                    title={tx.description}
                  >
                    {tx.description}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {tx.accounting_group_name || "-"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`font-semibold ${
                      tx.amount < 0 ? "text-red-600" : "text-blue-600"
                    }`}
                  >
                    {formatCurrency(Math.abs(tx.amount))}
                  </TableCell>
                  <TableCell><StatusBadge status={tx.approval_status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 件数表示 */}
      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} / {transactions.length} 件表示
      </p>
    </div>
  );
}
