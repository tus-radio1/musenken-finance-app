"use client";

/**
 * 出納帳のメインビュー。
 * サーバーで取得した初期データ (initialData) を使い、初回描画で二重フェッチを回避する (P-1)。
 * Realtime チャンネルは selectedGroup のみに依存し、フィルタ変更で再作成しない (P-5)。
 * 集計は lib/ledger.ts の純粋関数に委譲する (F-1)。
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchLedgerTransactions } from "@/app/(authenticated)/ledger/actions";
import { ROLE_TYPES } from "@/lib/roles/constants";
import {
  canCreateClubTransaction,
  isAccounting,
  isAdmin,
  isClubGroup,
} from "@/lib/roles/permissions";
import type { RoleAccessContext } from "@/lib/roles/types";
import { createClient } from "@/utils/supabase/client";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  calculateLedgerTotals,
  calculateClubLedgerSummary,
} from "@/lib/ledger";
import type {
  LedgerTransaction,
  LedgerInitialData,
  FinancialAccountInfo,
} from "@/lib/ledger";

import {
  LedgerSummary,
  ClubLedgerSummary,
  LedgerFilterBar,
  LedgerDesktopTable,
  LedgerMobileCards,
} from "@/components/ledger";
import type { SortKey, SortDir, Team } from "@/components/ledger";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  teams: Team[];
  fyYear?: number;
  /** Role context of the viewer; row permissions come from lib/roles/permissions. */
  access: RoleAccessContext;
  currentProfileId?: string;
  users?: { id: string; name: string }[];
  accountingUserId?: string;
  fiscalYears?: Array<{ year: number; is_current: boolean }>;
  selectedYear?: number;
  isReadOnly?: boolean;
  /** サーバー側で取得済みの初期データ。最初のグループ分のみ。 */
  initialData?: LedgerInitialData | null;
  financialAccounts: FinancialAccountInfo[];
};

// ---------------------------------------------------------------------------
// コンポーネント本体
// ---------------------------------------------------------------------------

export default function LedgerView({
  teams,
  fyYear,
  access,
  currentProfileId,
  users,
  accountingUserId,
  fiscalYears,
  selectedYear,
  isReadOnly = false,
  initialData,
  financialAccounts,
}: Props) {
  // --- 会計グループ選択 ---
  const [selectedGroup, setSelectedGroup] = useState<string | undefined>(
    () => teams[0]?.id,
  );

  // --- データ state ---
  // initialData がある場合は初期値として使う (P-1: 二重フェッチ回避)
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [rows, setRows] = useState<LedgerTransaction[]>(
    () => initialData?.data ?? [],
  );
  const [budgetAmount, setBudgetAmount] = useState<number>(
    () => initialData?.budgetAmount ?? 0,
  );
  const [carryoverAmount, setCarryoverAmount] = useState<number>(
    () => initialData?.carryoverAmount ?? 0,
  );
  const [categoriesForSelected, setCategoriesForSelected] = useState<
    Array<{ id: string; name: string }>
  >(() => {
    const first = teams[0];
    return first ? [{ id: first.id, name: first.name }] : [];
  });

  // initialData を使った初回描画はスキップするためのフラグ
  const isFirstRender = useRef(!!initialData);

  // --- ソート state ---
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // --- フィルタ state ---
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAccountId, setFilterAccountId] = useState<string>("all");
  const [filterKind, setFilterKind] = useState<string>("all");

  const isGlobalAdmin = isAdmin(access);
  const isAccountingUser = isAccounting(access);
  const isCurrentFiscalYear =
    fiscalYears?.find((fy) => fy.year === fyYear)?.is_current ?? false;

  // 部全体会計（club-wide）はグループの type で判定する
  const selectedTeam = teams.find((t) => t.id === selectedGroup);
  const isClubWideGroup = selectedTeam ? isClubGroup(selectedTeam) : false;

  const ledgerReadOnly =
    isReadOnly || (isClubWideGroup && !canCreateClubTransaction(access));

  const userRoleStr = isGlobalAdmin
    ? ROLE_TYPES.ADMIN
    : isAccountingUser
      ? ROLE_TYPES.ACCOUNTING
      : ROLE_TYPES.GENERAL;

  // --- ソートハンドラ ---
  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
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

  // --- グループ / 年度変更 + Realtime + ledger-refresh を統合した effect ---
  // fetchData を effect 内のローカル関数として定義し、
  // subscription のコールバックからも呼ぶことで set-state-in-effect を回避する。
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

      if (!active) return;

      if ("error" in res) {
        setLoadError(true);
      } else {
        setLoadError(false);
        setRows((res.data as LedgerTransaction[]) || []);
        setBudgetAmount(Number(res.budgetAmount) || 0);
        setCarryoverAmount(Number(res.carryoverAmount) || 0);
      }

      const selected = teams.find((t) => t.id === selectedGroup);
      setCategoriesForSelected(
        selected ? [{ id: selected.id, name: selected.name }] : [],
      );

      if (active) setLoading(false);
    };

    // 初回描画で initialData がある場合はフェッチをスキップ
    if (isFirstRender.current) {
      isFirstRender.current = false;
    } else {
      void fetchData();
    }

    // Realtime subscription (P-5: selectedGroup のみに依存)
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
  }, [selectedGroup, fyYear, teams, retryKey]);

  // --- 集計 (lib/ledger.ts の純粋関数に委譲) ---
  const totals = useMemo(
    () => calculateLedgerTotals(rows, budgetAmount, carryoverAmount),
    [rows, budgetAmount, carryoverAmount],
  );

  // --- Club-wide summary (only when club group is selected) ---
  const clubSummary = useMemo(() => {
    if (!isClubWideGroup) return null;
    return calculateClubLedgerSummary(rows, rows, financialAccounts);
  }, [rows, isClubWideGroup, financialAccounts]);

  // --- フィルタ + ソート ---
  const processedRows = useMemo(() => {
    let result = [...rows];

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

    if (filterStatus !== "all") {
      result = result.filter((r) => r.approval_status === filterStatus);
    }

    if (filterAccountId !== "all") {
      result = result.filter(
        (r) => r.financial_account_id === filterAccountId,
      );
    }

    if (filterKind !== "all") {
      result = result.filter((r) => r.transaction_kind === filterKind);
    }

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
  }, [rows, filterText, filterStatus, filterAccountId, filterKind, sortKey, sortDir]);

  // --- 描画 ---
  return (
    <>
      {/* ヘッダー: グループ選択 + 年度切替 */}
      <PageHeader
        title={selectedTeam ? `${selectedTeam.name}の出納帳` : "出納帳"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger aria-label="会計グループ" className="w-[180px]">
                <SelectValue placeholder="グループを選択" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((tm) => (
                  <SelectItem key={tm.id} value={tm.id}>
                    {tm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fiscalYears && fiscalYears.length > 0 && (
              <FiscalYearSelector
                fiscalYears={fiscalYears}
                selectedYear={selectedYear}
                basePath="/ledger"
              />
            )}
          </div>
        }
      />
      {isReadOnly && (
        <div className="rounded-md border border-warning/50 bg-warning px-4 py-3 text-sm text-warning-foreground">
          過年度データのため閲覧専用です
        </div>
      )}

      {loadError ? (
        <ErrorState
          title="出納帳データを読み込めませんでした"
          description="取引データの取得中にエラーが発生しました。時間をおいて再度お試しください。"
          onRetry={() => setRetryKey((current) => current + 1)}
        />
      ) : (
        <>
      {/* サマリーカード */}
      {isClubWideGroup && clubSummary ? (
        <ClubLedgerSummary
          summary={clubSummary}
          financialAccounts={financialAccounts}
        />
      ) : (
        <LedgerSummary
          budgetAmount={budgetAmount}
          carryoverAmount={carryoverAmount}
          totals={totals}
        />
      )}

      {/* 取引一覧 */}
      <Card>
        <CardHeader>
          <CardTitle>取引一覧</CardTitle>
        </CardHeader>
        <CardContent>
          <LedgerFilterBar
            loading={loading}
            filteredCount={processedRows.length}
            totalCount={rows.length}
            filterText={filterText}
            onFilterTextChange={setFilterText}
            filterStatus={filterStatus}
            onFilterStatusChange={setFilterStatus}
            financialAccounts={
              isClubWideGroup ? financialAccounts : undefined
            }
            filterAccountId={filterAccountId}
            onFilterAccountChange={
              isClubWideGroup ? setFilterAccountId : undefined
            }
            filterKind={filterKind}
            onFilterKindChange={isClubWideGroup ? setFilterKind : undefined}
          />

          {processedRows.length === 0 ? (
            <EmptyState
              message={rows.length === 0 ? "取引データがありません" : "条件に一致する取引がありません"}
              className="py-6"
            />
          ) : (
            <>
          {/* モバイル表示 */}
          <LedgerMobileCards
            rows={processedRows}
            currentProfileId={currentProfileId}
            access={access}
            isCurrentFiscalYear={isCurrentFiscalYear}
            isReadOnly={ledgerReadOnly}
            categoriesForSelected={categoriesForSelected}
            userRoleStr={userRoleStr}
            users={users}
            accountingUserId={accountingUserId}
            showExtendedColumns={isClubWideGroup}
          />

          {/* デスクトップ表示 */}
          <LedgerDesktopTable
            rows={processedRows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            currentProfileId={currentProfileId}
            access={access}
            isCurrentFiscalYear={isCurrentFiscalYear}
            isReadOnly={ledgerReadOnly}
            categoriesForSelected={categoriesForSelected}
            userRoleStr={userRoleStr}
            users={users}
            accountingUserId={accountingUserId}
            showExtendedColumns={isClubWideGroup}
          />
            </>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </>
  );
}
