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
import { createClient } from "@/utils/supabase/client";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";
import { calculateLedgerTotals } from "@/lib/ledger";
import type { LedgerTransaction, LedgerInitialData } from "@/lib/ledger";

import {
  LedgerSummary,
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
  isGlobalAdmin: boolean;
  isAccountingUser: boolean;
  currentProfileId?: string;
  users?: { id: string; name: string }[];
  accountingUserId?: string;
  fiscalYears?: Array<{ year: number; is_current: boolean }>;
  selectedYear?: number;
  isReadOnly?: boolean;
  /** サーバー側で取得済みの初期データ。最初のグループ分のみ。 */
  initialData?: LedgerInitialData | null;
};

// ---------------------------------------------------------------------------
// コンポーネント本体
// ---------------------------------------------------------------------------

export default function LedgerView({
  teams,
  fyYear,
  isGlobalAdmin,
  isAccountingUser,
  currentProfileId,
  users,
  accountingUserId,
  fiscalYears,
  selectedYear,
  isReadOnly = false,
  initialData,
}: Props) {
  // --- 会計グループ選択 ---
  const [selectedGroup, setSelectedGroup] = useState<string | undefined>(
    () => teams[0]?.id,
  );

  // --- データ state ---
  // initialData がある場合は初期値として使う (P-1: 二重フェッチ回避)
  const [loading, setLoading] = useState(false);
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

  const isAdminOrAccounting = isAccountingUser || isGlobalAdmin;

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
        setRows([]);
        setBudgetAmount(0);
        setCarryoverAmount(0);
      } else {
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
  }, [selectedGroup, fyYear, teams]);

  // --- 集計 (lib/ledger.ts の純粋関数に委譲) ---
  const totals = useMemo(
    () => calculateLedgerTotals(rows, budgetAmount, carryoverAmount),
    [rows, budgetAmount, carryoverAmount],
  );

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

  // --- 描画 ---
  return (
    <>
      {/* ヘッダー: グループ選択 + 年度切替 */}
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

      {/* サマリーカード */}
      <LedgerSummary
        budgetAmount={budgetAmount}
        carryoverAmount={carryoverAmount}
        totals={totals}
      />

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
          />

          {/* モバイル表示 */}
          <LedgerMobileCards
            rows={processedRows}
            currentProfileId={currentProfileId}
            isAdminOrAccounting={isAdminOrAccounting}
            isGlobalAdmin={isGlobalAdmin}
            isReadOnly={isReadOnly ?? false}
            categoriesForSelected={categoriesForSelected}
            userRoleStr={userRoleStr}
            users={users}
            accountingUserId={accountingUserId}
          />

          {/* デスクトップ表示 */}
          <LedgerDesktopTable
            rows={processedRows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            currentProfileId={currentProfileId}
            isAdminOrAccounting={isAdminOrAccounting}
            isGlobalAdmin={isGlobalAdmin}
            isReadOnly={isReadOnly ?? false}
            categoriesForSelected={categoriesForSelected}
            userRoleStr={userRoleStr}
            users={users}
            accountingUserId={accountingUserId}
          />
        </CardContent>
      </Card>
    </>
  );
}
