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
import { fetchLedgerTransactions } from "@/app/(authenticated)/ledger/actions";
import {
  Receipt,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalActions } from "@/components/approval-actions";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import Link from "next/link";
import { ROLE_TYPES } from "@/lib/roles/constants";
import { createClient } from "@/utils/supabase/client";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";

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
  fiscalYears?: Array<{ year: number; is_current: boolean }>;
  selectedYear?: number;
  isReadOnly?: boolean;
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
  fiscalYears,
  selectedYear,
  isReadOnly = false,
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

  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  const toggleCard = useCallback((id: string) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const isAdminOrAccounting = isAccountingUser || isGlobalAdmin;

  const userRoleStr = isGlobalAdmin
    ? ROLE_TYPES.ADMIN
    : isAccountingUser
      ? ROLE_TYPES.ACCOUNTING
      : ROLE_TYPES.GENERAL;

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
    const supabase = createClient();

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
    const handleRefresh = () => {
      void fetchData();
    };
    window.addEventListener("ledger-refresh", handleRefresh);

    const channel = selectedGroup
      ? supabase
          .channel(`ledger-transactions-${selectedGroup}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "transactions",
              filter: `accounting_group_id=eq.${selectedGroup}`,
            },
            () => {
              void fetchData();
            },
          )
          .subscribe()
      : null;

    return () => {
      active = false;
      window.removeEventListener("ledger-refresh", handleRefresh);
      if (channel) {
        void supabase.removeChannel(channel);
      }
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
        <div className="flex justify-between items-center">
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
          {fiscalYears && fiscalYears.length > 0 && (
            <FiscalYearSelector
              fiscalYears={fiscalYears}
              selectedYear={selectedYear}
              basePath="/ledger"
            />
          )}
        </div>
        {isReadOnly && (
          <div className="mt-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
            過年度データのため閲覧専用です
          </div>
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
          {/* Mobile card view */}
          <div className="xl:hidden space-y-3">
            {processedRows.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                取引データがありません
              </div>
            ) : (
              processedRows.map((r) => {
                const isOwner =
                  !!currentProfileId && r.created_by === currentProfileId;
                const canEdit =
                  !isReadOnly &&
                  (isAdminOrAccounting ||
                    (isOwner && r.approval_status === "pending"));
                const canDelete = !isReadOnly && isGlobalAdmin;

                return (
                  <Collapsible
                    key={r.id}
                    open={openCards.has(r.id)}
                    onOpenChange={() => toggleCard(r.id)}
                  >
                    <div className="border rounded-lg p-4 bg-card space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-muted-foreground">
                            {r.date
                              ? new Date(r.date).toLocaleDateString("ja-JP")
                              : "-"}
                          </div>
                          <div className="text-sm font-medium truncate">
                            {r.created_by_name || "未登録"}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div
                            className={`text-base font-semibold ${
                              Number(r.amount) < 0
                                ? "text-red-600"
                                : "text-green-600"
                            }`}
                          >
                            {formatCurrency(Number(r.amount))}
                          </div>
                        </div>
                      </div>

                      <div className="text-sm text-muted-foreground truncate">
                        {r.is_subsidy && (
                          <Badge
                            variant="secondary"
                            className="mr-1 bg-blue-100 text-blue-800 hover:bg-blue-100 border-none text-xs"
                          >
                            支援金
                          </Badge>
                        )}
                        <span>{r.description || "-"}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="shrink-0">
                          {r.is_subsidy ? (
                            <StatusBadge
                              status={r.approval_status || "pending"}
                            />
                          ) : (
                            <ApprovalActions
                              transactionId={r.id}
                              status={r.approval_status || "pending"}
                              canApprove={isAdminOrAccounting}
                              isMyTransaction={isOwner}
                              amount={Number(r.amount)}
                            />
                          )}
                        </div>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 px-2">
                            詳細
                            <ChevronDown
                              className={`ml-1 h-3.5 w-3.5 transition-transform ${
                                openCards.has(r.id) ? "rotate-180" : ""
                              }`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                      </div>

                      <CollapsibleContent className="space-y-3 pt-1">
                        {r.remarks && (
                          <div className="text-sm">
                            <span className="text-muted-foreground font-medium">
                              備考:{" "}
                            </span>
                            <span className="whitespace-pre-wrap break-words">
                              {r.remarks}
                            </span>
                          </div>
                        )}

                        {!r.is_subsidy && (
                          <div className="text-sm">
                            <span className="text-muted-foreground font-medium">
                              承認者:{" "}
                            </span>
                            <span>{r.approved_by_name || "\u2014"}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1 flex-wrap">
                          {(() => {
                            if (r.is_subsidy) {
                              if (isAdminOrAccounting) {
                                return (
                                  <Button variant="outline" size="sm" asChild>
                                    <Link href="/subsidies/manage">
                                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                      支援金
                                    </Link>
                                  </Button>
                                );
                              } else if (isOwner) {
                                return (
                                  <Button variant="outline" size="sm" asChild>
                                    <Link href="/subsidies">
                                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                      支援金
                                    </Link>
                                  </Button>
                                );
                              }
                              return null;
                            }
                            return null;
                          })()}
                          {r.receipt_public_url && (
                            <Button variant="outline" size="sm" asChild>
                              <a
                                href={r.receipt_public_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Receipt className="h-3.5 w-3.5 mr-1" />
                                領収書
                              </a>
                            </Button>
                          )}
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
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden xl:block">
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
                    !isReadOnly &&
                    (isAdminOrAccounting ||
                      (isOwner && r.approval_status === "pending"));
                  const canDelete = !isReadOnly && isGlobalAdmin;

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
          </div>
        </CardContent>
      </Card>
    </>
  );
}
