"use client";

/**
 * 支援金管理画面: モバイルカード一覧 (xl未満で表示)
 * 各申請をカード形式で表示し、折りたたみで詳細・ステータス変更を行う。
 */

import { Receipt, FileText, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatStoredDate } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import {
  CATEGORY_LABELS as CATEGORY_MAP,
  EXPENSE_TYPE_LABELS as EXPENSE_TYPE_MAP,
  STATUS_VARIANT_MAP as STATUS_MAP,
} from "@/lib/constants/subsidy";
import { StatusBadge } from "@/components/status-badge";
import type { SubsidyItem } from "./types";

type ManageMobileCardListProps = {
  filteredItems: SubsidyItem[];
  openCards: Set<string>;
  onToggleCard: (id: string) => void;
  onStatusChange: (id: string, newStatus: string) => void;
  onEditClick: (item: SubsidyItem) => void;
  isReadOnly: boolean;
  publicReceiptBase: string | null;
};

export function ManageMobileCardList({
  filteredItems,
  openCards,
  onToggleCard,
  onStatusChange,
  onEditClick,
  isReadOnly,
  publicReceiptBase,
}: ManageMobileCardListProps) {
  if (filteredItems.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        該当する支援金申請はありません
      </div>
    );
  }

  return (
    <>
      {filteredItems.map((item) => (
        <Collapsible
          key={item.id}
          open={openCards.has(item.id)}
          onOpenChange={() => onToggleCard(item.id)}
        >
          <div className="border rounded-lg p-4 bg-card space-y-3">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">
                  {formatStoredDate(item.created_at)}
                </div>
                <div className="font-medium truncate">{item.name}</div>
                <div className="text-xs text-muted-foreground">
                  {item.applicant_name}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-base font-semibold">
                  {formatCurrency(item.requested_amount)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 border border-blue-200">
                  {CATEGORY_MAP[item.category] || item.category}
                </span>
                <Badge variant="outline" className="text-xs">
                  {EXPENSE_TYPE_MAP[item.expense_type] || item.expense_type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  第{item.term}期
                </span>
                <StatusBadge status={item.status} className="text-xs" />
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  詳細
                  <ChevronDown
                    className={`ml-1 h-3.5 w-3.5 transition-transform ${
                      openCards.has(item.id) ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </CollapsibleTrigger>
            </div>

            {item.usage_period && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">使用時期: </span>
                <span>{item.usage_period}</span>
              </div>
            )}

            <CollapsibleContent className="space-y-3 pt-1">
              {item.justification && (
                <div className="text-sm">
                  <span className="text-muted-foreground font-medium">
                    申請理由:{" "}
                  </span>
                  <span className="whitespace-pre-wrap break-words">
                    {item.justification}
                  </span>
                </div>
              )}

              <div className="w-full">
                <Select
                  value={item.status}
                  onValueChange={(val) =>
                    onStatusChange(item.id, val)
                  }
                  disabled={isReadOnly}
                >
                  <SelectTrigger className="w-full h-8 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_MAP).map(
                      ([key, { label }]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground font-medium">算定額: </span>
                  <span className={item.calculated_amount > 0 ? "font-medium text-emerald-600" : "text-muted-foreground"}>
                    {formatCurrency(item.calculated_amount)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">実経費額: </span>
                  <span className={item.actual_expense > 0 ? "font-medium text-blue-600" : "text-muted-foreground"}>
                    {formatCurrency(item.actual_expense)}
                  </span>
                </div>
              </div>

              <div className="text-sm">
                <span className="text-muted-foreground font-medium">受領日: </span>
                <span>
                  {item.receipt_date
                    ? formatStoredDate(item.receipt_date)
                    : "—"}
                </span>
              </div>

              {(item.receipt_url || item.evidence_url) && (
                <div className="text-sm">
                  <span className="text-muted-foreground font-medium block mb-1">添付書類:</span>
                  <div className="flex flex-col gap-1">
                    {item.receipt_url && (
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
                        className="inline-flex items-center text-blue-600 hover:underline text-xs"
                      >
                        <Receipt className="h-4 w-4 mr-1" />
                        領収書
                      </a>
                    )}
                    {item.evidence_url && (
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
                        className="inline-flex items-center text-blue-600 hover:underline text-xs"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        根拠書類
                      </a>
                    )}
                  </div>
                </div>
              )}

              {item.remarks && (
                <div className="text-sm">
                  <span className="text-muted-foreground font-medium">
                    備考:{" "}
                  </span>
                  <span className="whitespace-pre-wrap break-words">
                    {item.remarks}
                  </span>
                </div>
              )}

              {!isReadOnly && (
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEditClick(item)}
                  >
                    編集
                  </Button>
                </div>
              )}
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}
    </>
  );
}
