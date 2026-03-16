"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { TransactionRowActions } from "@/components/transaction-row-actions";
import { fetchLedgerTransactions } from "@/app/ledger/actions";
import {
  Receipt,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from "lucide-react";
import { ApprovalActions } from "@/components/approval-actions";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type Team = { id: string; name: string; type: "general" | "leader" };

type LedgerTransaction = {
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
};

type Props = {
  teams: Team[];
  fyYear?: number;
  isGlobalAdmin: boolean;
  isAccountingUser: boolean;
  currentProfileId?: string;
  users?: { id: string; name: string }[];
};

type SortKey =
  | "date"
  | "created_by_name"
  | "description"
  | "amount"
  | "approval_status"
  | "approved_by_name";
type SortDir = "asc" | "desc" | null;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

function SortableHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey | null;
  currentSortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSortKey === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer select-none"
      >
        {label}
        {isActive && currentSortDir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : isActive && currentSortDir === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
        )}
      </button>
    </TableHead>
  );
}

export default function LedgerView({
  teams,
  fyYear,
  isGlobalAdmin,
  isAccountingUser,
  currentProfileId,
  users,
}: Props) {
  const [selectedGroup, setSelectedGroup] = useState<string | undefined>(
    () => teams[0]?.id,
  );
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LedgerTransaction[]>([]);
  const [budgetAmount, setBudgetAmount] = useState<number>(0);
  const [categoriesForSelected, setCategoriesForSelected] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // ソート state
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // フィルタ state
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const isAdminOrAccounting = isAccountingUser || isGlobalAdmin;

  const userRoleStr = isGlobalAdmin
    ? "admin"
    : isAccountingUser
      ? "accounting"
      : "general";

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        // 同じキー: asc → desc → null (リセット)
        if (sortDir === "asc") setSortDir("desc");
        else if (sortDir === "desc") {
          setSortKey(null);
          setSortDir(null);
          return;
        }
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey, sortDir],
  );

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      if (!selectedGroup) return;
      setLoading(true);

      const res = await fetchLedgerTransactions({
        accountingGroupId: selectedGroup,
        fyYear,
      });

      type FetchResult = Awaited<ReturnType<typeof fetchLedgerTransactions>>;
      const isError = (
        r: FetchResult,
      ): r is Extract<FetchResult, { error: unknown }> => "error" in r;

      if (!active) return;

      if (isError(res)) {
        setRows([]);
        setBudgetAmount(0);
      } else {
        const okRes = res as Extract<FetchResult, { data: unknown }>;
        setRows((okRes.data as LedgerTransaction[]) || []);
        setBudgetAmount(
          Number((res as unknown as { budgetAmount?: unknown }).budgetAmount) ||
            0,
        );
      }

      // カテゴリ名（選択中のみ / UI用）
      const selected = teams.find((t) => t.id === selectedGroup);
      setCategoriesForSelected(
        selected ? [{ id: selected.id, name: selected.name }] : [],
      );

      if (!active) return;
      setLoading(false);
    };
    fetchData();

    // 取引変更後の自動再取得
    const handleRefresh = () => fetchData();
    window.addEventListener("ledger-refresh", handleRefresh);

    return () => {
      active = false;
      window.removeEventListener("ledger-refresh", handleRefresh);
    };
  }, [selectedGroup, fyYear, teams]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    (rows || []).forEach((r) => {
      const amt = Number(r.amount) || 0;
      if (amt >= 0) income += amt;
      else expense += Math.abs(amt);
    });
    const budgetRemaining = (Number(budgetAmount) || 0) + income - expense;
    return { income, expense, budgetRemaining };
  }, [rows, budgetAmount]);

  // フィルタ + ソート済みの行
  const processedRows = useMemo(() => {
    let result = [...rows];

    // テキストフィルタ
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      result = result.filter(
        (r) =>
          (r.date && r.date.includes(q)) ||
          (r.created_by_name && r.created_by_name.toLowerCase().includes(q)) ||
          (r.description && r.description.toLowerCase().includes(q)) ||
          String(r.amount).includes(q) ||
          (r.approved_by_name && r.approved_by_name.toLowerCase().includes(q)),
      );
    }

    // ステータスフィルタ
    if (filterStatus !== "all") {
      result = result.filter((r) => r.approval_status === filterStatus);
    }

    // ソート
    if (sortKey && sortDir) {
      result.sort((a, b) => {
        let va: string | number = "";
        let vb: string | number = "";

        switch (sortKey) {
          case "date":
            va = a.date || "";
            vb = b.date || "";
            break;
          case "created_by_name":
            va = (a.created_by_name || "").toLowerCase();
            vb = (b.created_by_name || "").toLowerCase();
            break;
          case "description":
            va = (a.description || "").toLowerCase();
            vb = (b.description || "").toLowerCase();
            break;
          case "amount":
            va = Number(a.amount) || 0;
            vb = Number(b.amount) || 0;
            break;
          case "approval_status":
            va = a.approval_status || "";
            vb = b.approval_status || "";
            break;
          case "approved_by_name":
            va = (a.approved_by_name || "").toLowerCase();
            vb = (b.approved_by_name || "").toLowerCase();
            break;
        }

        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [rows, filterText, filterStatus, sortKey, sortDir]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-baseline gap-0 flex-wrap">
          <Select value={selectedGroup} onValueChange={setSelectedGroup}>
            <SelectTrigger className="inline-flex w-auto gap-1 border-none shadow-none px-0 text-2xl font-bold h-auto focus:ring-0 text-primary border-b-2 border-dotted border-primary/40 rounded-none hover:border-primary transition-colors cursor-pointer">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((tm) => (
                <SelectItem key={tm.id} value={tm.id}>
                  {tm.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-1">の出納帳</span>
        </h1>
        {typeof fyYear !== "undefined" && (
          <p className="text-sm text-muted-foreground mt-1">
            対象年度: {fyYear}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>集計</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-muted rounded p-4">
            <div className="text-sm text-muted-foreground">今年度予算額</div>
            <div className="text-xl font-semibold">
              {formatCurrency(Number(budgetAmount) || 0)}
            </div>
          </div>
          <div className="bg-muted rounded p-4">
            <div className="text-sm text-muted-foreground">収入合計</div>
            <div className="text-xl font-semibold">
              {formatCurrency(totals.income)}
            </div>
          </div>
          <div className="bg-muted rounded p-4">
            <div className="text-sm text-muted-foreground">支出合計</div>
            <div className="text-xl font-semibold">
              {formatCurrency(totals.expense)}
            </div>
          </div>
          <div className="bg-muted rounded p-4">
            <div className="text-sm text-muted-foreground">今年度予算残高</div>
            <div
              className={`text-xl font-semibold ${totals.budgetRemaining < 0 ? "text-red-600" : ""}`}
            >
              {formatCurrency(totals.budgetRemaining)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>取引一覧</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div className="text-sm text-muted-foreground">
              {loading
                ? "読み込み中..."
                : `${processedRows.length}件${processedRows.length !== rows.length ? ` / ${rows.length}件中` : ""}`}
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Input
                placeholder="検索..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="h-8 w-full sm:w-48"
              />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
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
                  <SelectItem value="refunded">返金済</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader
                  label="日付"
                  sortKey="date"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="申請者"
                  sortKey="created_by_name"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="概要"
                  sortKey="description"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="金額"
                  sortKey="amount"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  className="text-right"
                />
                <TableHead>領収書・詳細</TableHead>
                <TableHead>備考</TableHead>
                <SortableHeader
                  label="承認状況"
                  sortKey="approval_status"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="承認者"
                  sortKey="approved_by_name"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedRows.map((r) => {
                const isOwner =
                  !!currentProfileId && r.created_by === currentProfileId;
                const canEdit =
                  isAdminOrAccounting ||
                  (isOwner && r.approval_status === "pending");

                // 会計役職の削除権限は現状維持（自分が作成したデータのみ）
                // したがって、削除できるのは「Admin」か「自分が作ったデータかつ(Admin/会計以外なら)受付中」
                const isGeneralUserOnly =
                  !isGlobalAdmin && !isAccountingUser && !r.is_subsidy; // is_subsidy は今回は考慮外だが念の為

                let canDelete = false;
                if (isGlobalAdmin) {
                  // Adminのみ削除可能
                  canDelete = true;
                }

                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.date
                        ? new Date(r.date).toLocaleDateString("ja-JP")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {r.created_by_name || "未登録"}
                    </TableCell>
                    <TableCell
                      className="min-w-[200px] max-w-[400px] break-words whitespace-normal space-x-2"
                      title={r.description ?? undefined}
                    >
                      {r.is_subsidy && (
                        <Badge
                          variant="secondary"
                          className="mr-1 bg-blue-100 text-blue-800 hover:bg-blue-100 border-none"
                        >
                          支援金
                        </Badge>
                      )}
                      <span>{r.description || "-"}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          Number(r.amount) < 0
                            ? "text-red-600"
                            : "text-green-600"
                        }
                      >
                        {formatCurrency(Number(r.amount))}
                      </span>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        if (r.is_subsidy) {
                          if (isAdminOrAccounting) {
                            return (
                              <Link
                                href="/subsidies/manage"
                                className="flex items-center text-blue-600 hover:underline text-xs"
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                支援金詳細
                              </Link>
                            );
                          } else if (isOwner) {
                            return (
                              <Link
                                href="/subsidies"
                                className="flex items-center text-blue-600 hover:underline text-xs"
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                支援金詳細
                              </Link>
                            );
                          } else if (r.receipt_public_url) {
                            return (
                              <a
                                href={r.receipt_public_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center text-blue-600 hover:underline text-xs"
                              >
                                <Receipt className="h-4 w-4 mr-1" />
                                領収書確認
                              </a>
                            );
                          } else {
                            return (
                              <span className="text-gray-300 text-xs">-</span>
                            );
                          }
                        } else if (r.receipt_public_url) {
                          return (
                            <a
                              href={r.receipt_public_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center text-blue-600 hover:underline text-xs"
                            >
                              <Receipt className="h-4 w-4 mr-1" />
                              確認
                            </a>
                          );
                        } else {
                          return (
                            <span className="text-gray-300 text-xs">-</span>
                          );
                        }
                      })()}
                    </TableCell>
                    <TableCell
                      className="min-w-[150px] max-w-[300px] break-words whitespace-normal"
                      title={r.remarks || ""}
                    >
                      {r.remarks || "-"}
                    </TableCell>
                    <TableCell>
                      {!r.is_subsidy && (
                        <ApprovalActions
                          transactionId={r.id}
                          status={r.approval_status || "pending"}
                          canApprove={isAdminOrAccounting}
                          isMyTransaction={isOwner}
                          amount={Number(r.amount)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {r.is_subsidy ? "-" : r.approved_by_name || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {!r.is_subsidy && (
                        <TransactionRowActions
                          transaction={r}
                          categories={categoriesForSelected}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          userRole={userRoleStr}
                          users={users}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
