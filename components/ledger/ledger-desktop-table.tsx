"use client";

/**
 * 出納帳のデスクトップ用テーブル表示。xl 以上で表示される。
 */

import { formatCurrency } from "@/lib/format";
import { formatStoredDate } from "@/lib/date";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TransactionRowActions } from "@/components/transaction-row-actions";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalActions } from "@/components/approval-actions";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import type { LedgerTransaction, SortKey, SortDir } from "./types";

// ---------------------------------------------------------------------------
// ソート可能なヘッダーセル
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// デスクトップテーブル本体
// ---------------------------------------------------------------------------

type Props = {
  rows: LedgerTransaction[];
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  currentProfileId?: string;
  isAdminOrAccounting: boolean;
  isGlobalAdmin: boolean;
  isReadOnly: boolean;
  categoriesForSelected: Array<{ id: string; name: string }>;
  userRoleStr: "admin" | "accounting" | "general";
  users?: { id: string; name: string }[];
  accountingUserId?: string;
};

export function LedgerDesktopTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  currentProfileId,
  isAdminOrAccounting,
  isGlobalAdmin,
  isReadOnly,
  categoriesForSelected,
  userRoleStr,
  users,
  accountingUserId,
}: Props) {
  return (
    <div className="hidden xl:block">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader
              label="日付"
              sortKey="date"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="申請者"
              sortKey="created_by_name"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="概要"
              sortKey="description"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="金額"
              sortKey="amount"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={onSort}
              className="text-right"
            />
            <TableHead>領収書・詳細</TableHead>
            <TableHead>備考</TableHead>
            <SortableHeader
              label="承認状況"
              sortKey="approval_status"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="承認者"
              sortKey="approved_by_name"
              currentSortKey={sortKey}
              currentSortDir={sortDir}
              onSort={onSort}
            />
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
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
                    ? formatStoredDate(r.date)
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
                      accountingUserId={accountingUserId}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
