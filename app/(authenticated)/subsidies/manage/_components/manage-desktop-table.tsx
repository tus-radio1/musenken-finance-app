"use client";

/**
 * 支援金管理画面: デスクトップテーブル (xl以上で表示)
 * 申請一覧をテーブル形式で表示し、ステータス変更・詳細展開・編集を行う。
 */

import { Fragment } from "react";
import { Receipt, FileText, ChevronDown, ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatStoredDate } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import {
  CATEGORY_LABELS as CATEGORY_MAP,
  EXPENSE_TYPE_LABELS as EXPENSE_TYPE_MAP,
  STATUS_VARIANT_MAP as STATUS_MAP,
} from "@/lib/constants/subsidy";
import type { SubsidyItem, SortKey, SortOrder } from "./types";

type ManageDesktopTableProps = {
  filteredItems: SubsidyItem[];
  openDetailRows: Set<string>;
  onToggleDetailRow: (id: string) => void;
  onStatusChange: (id: string, newStatus: string) => void;
  onEditClick: (item: SubsidyItem) => void;
  onSortToggle: (key: SortKey) => void;
  sortKey: SortKey;
  sortOrder: SortOrder;
  isReadOnly: boolean;
  publicReceiptBase: string | null;
};

export function ManageDesktopTable({
  filteredItems,
  openDetailRows,
  onToggleDetailRow,
  onStatusChange,
  onEditClick,
  onSortToggle,
  sortKey,
  sortOrder,
  isReadOnly,
  publicReceiptBase,
}: ManageDesktopTableProps) {
  return (
    <div className="border rounded-lg overflow-x-auto bg-card hidden xl:block">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
          <tr>
            <th className="p-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 font-medium text-muted-foreground hover:text-foreground"
                onClick={() => onSortToggle("created_at")}
              >
                申請日
                <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                {sortKey === "created_at" && (
                  <span className="ml-0.5 text-[10px]">
                    {sortOrder === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </Button>
            </th>
            <th className="p-3">申請者</th>
            <th className="p-3">項目名</th>
            <th className="p-3">状況</th>
            <th className="p-3 text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 font-medium text-muted-foreground hover:text-foreground ml-auto"
                onClick={() => onSortToggle("requested_amount")}
              >
                申請額
                <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                {sortKey === "requested_amount" && (
                  <span className="ml-0.5 text-[10px]">
                    {sortOrder === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </Button>
            </th>
            <th className="p-3 text-right">算定額</th>
            <th className="p-3">添付書類</th>
            <th className="p-3 w-[60px]">詳細</th>
            <th className="p-3 w-[80px]"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {filteredItems.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                className="p-6 text-center text-muted-foreground"
              >
                該当する支援金申請はありません
              </td>
            </tr>
          ) : (
            filteredItems.map((item) => (
              <Fragment key={item.id}>
              <tr
                className="hover:bg-muted/50 transition-colors"
              >
                <td className="p-3">
                  <span className="text-sm">
                    {formatStoredDate(item.created_at)}
                  </span>
                </td>

                <td className="p-3">
                  <div
                    className="text-sm max-w-[120px] truncate"
                    title={item.applicant_name}
                  >
                    {item.applicant_name}
                  </div>
                  {item.accounting_group_name &&
                    item.accounting_group_name !== "-" && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate bg-muted inline-block px-1 rounded">
                        {item.accounting_group_name}
                      </div>
                    )}
                </td>

                <td className="p-3">
                  <div className="font-medium">{item.name}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="px-1.5 py-0 rounded text-[11px] bg-blue-100 text-blue-800 border border-blue-200">
                      {CATEGORY_MAP[item.category] || item.category}
                    </span>
                    <span className="px-1.5 py-0 rounded text-[11px] bg-muted text-muted-foreground border">
                      第{item.term}期
                    </span>
                    <span className="px-1.5 py-0 rounded text-[11px] bg-muted text-muted-foreground border">
                      {EXPENSE_TYPE_MAP[item.expense_type] ||
                        item.expense_type}
                    </span>
                  </div>
                </td>

                <td className="p-3">
                  <Select
                    value={item.status}
                    onValueChange={(val) => onStatusChange(item.id, val)}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger className="w-[120px] h-8 relative shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                <td className="p-3 text-right">
                  <span className="font-medium">
                    {formatCurrency(item.requested_amount)}
                  </span>
                </td>

                <td className="p-3 text-right">
                  <span
                    className={
                      item.calculated_amount > 0
                        ? "font-medium text-emerald-600"
                        : "text-muted-foreground"
                    }
                  >
                    {formatCurrency(item.calculated_amount)}
                  </span>
                </td>

                <td className="p-3 text-sm">
                  <div className="flex flex-col gap-1">
                    {item.receipt_url ? (
                      <a
                        href={
                          item.receipt_url.startsWith("http")
                            ? item.receipt_url
                            : publicReceiptBase
                              ? `${publicReceiptBase}${item.receipt_url}`
                              : "#"
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-blue-600 hover:underline text-xs"
                      >
                        <Receipt className="h-4 w-4 mr-1" />
                        領収書
                      </a>
                    ) : null}
                    {item.evidence_url ? (
                      <a
                        href={
                          item.evidence_url.startsWith("http")
                            ? item.evidence_url
                            : publicReceiptBase
                              ? `${publicReceiptBase}${item.evidence_url}`
                              : "#"
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-blue-600 hover:underline text-xs"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        根拠書類
                      </a>
                    ) : null}
                    {!item.receipt_url && !item.evidence_url && "-"}
                  </div>
                </td>

                <td className="p-3 align-middle">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => onToggleDetailRow(item.id)}
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        openDetailRows.has(item.id) ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                </td>

                <td className="p-3 align-middle text-right shrink-0">
                  {!isReadOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditClick(item)}
                    >
                      編集
                    </Button>
                  )}
                </td>
              </tr>
              {openDetailRows.has(item.id) && (
                <tr key={`${item.id}-detail`} className="bg-muted/30">
                  <td colSpan={9} className="px-4 py-3">
                    <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="font-medium text-muted-foreground">実経費額: </span>
                        <span
                          className={
                            item.actual_expense > 0
                              ? "font-medium text-blue-600"
                              : "text-muted-foreground"
                          }
                        >
                          {formatCurrency(item.actual_expense)}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">受領日: </span>
                        <span>{item.receipt_date ? formatStoredDate(item.receipt_date) : "-"}</span>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">使用時期: </span>
                        <span>{item.usage_period || "-"}</span>
                      </div>
                      {item.justification && (
                        <div className="col-span-3">
                          <span className="font-medium text-muted-foreground">申請理由: </span>
                          <span className="whitespace-pre-wrap break-words">{item.justification}</span>
                        </div>
                      )}
                      <div className="col-span-3">
                        <span className="font-medium text-muted-foreground">備考: </span>
                        <span className="whitespace-pre-wrap break-words">{item.remarks || "-"}</span>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
