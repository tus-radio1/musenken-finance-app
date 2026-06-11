"use client";

/**
 * 支援金申請一覧: モバイルカード表示 (xl未満で表示)
 * 各申請をカード形式で表示し、折りたたみで詳細・操作メニューを表示する。
 */

import {
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatStoredDate } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import {
  CATEGORY_LABELS,
  EXPENSE_TYPE_LABELS,
  CATEGORY_BADGE_COLORS,
} from "@/lib/constants/subsidy";
import type { SubsidyItem } from "./types";

type ItemsMobileCardListProps = {
  items: SubsidyItem[];
  openCards: Set<string>;
  onToggleCard: (id: string) => void;
  onEditClick: (item: SubsidyItem) => void;
  onDeleteClick: (item: SubsidyItem) => void;
  isGlobalAdmin: boolean;
};

export function ItemsMobileCardList({
  items,
  openCards,
  onToggleCard,
  onEditClick,
  onDeleteClick,
  isGlobalAdmin,
}: ItemsMobileCardListProps) {
  return (
    <div className="xl:hidden space-y-3">
      {items.map((item) => {
        const canEdit =
          isGlobalAdmin || item.status === "pending" || item.status === "approved";
        const canDelete =
          isGlobalAdmin || item.status === "pending";
        return (
          <Collapsible
            key={item.id}
            open={openCards.has(item.id)}
            onOpenChange={() => onToggleCard(item.id)}
          >
            <div className="border rounded-lg p-4 bg-card space-y-3">
              {/* Header row: date + amount */}
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {formatStoredDate(item.created_at)}
                  </div>
                  <div className="font-medium truncate" title={item.name}>
                    {item.name}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-base">
                    {formatCurrency(item.requested_amount)}
                  </div>
                </div>
              </div>

              {/* Second row: category badge + term */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={CATEGORY_BADGE_COLORS[item.category] || ""}
                  >
                    {CATEGORY_LABELS[item.category] || item.category}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {EXPENSE_TYPE_LABELS[item.expense_type] || item.expense_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.term}期
                  </span>
                  <StatusBadge status={item.status} />
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

              {/* Usage period (always visible) */}
              {item.usage_period && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">使用時期: </span>
                  <span>{item.usage_period}</span>
                </div>
              )}

              {/* Collapsible details */}
              <CollapsibleContent className="space-y-3 pt-1">
                {/* Remarks */}
                <div className="text-sm">
                  <span className="text-muted-foreground font-medium">
                    備考:{" "}
                  </span>
                  <span className="whitespace-pre-wrap break-words">{item.remarks || "—"}</span>
                </div>

                {/* Receipt link */}
                <div className="text-sm">
                  <span className="text-muted-foreground font-medium">
                    領収書:{" "}
                  </span>
                  {item.receipt_public_url ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      asChild
                    >
                      <a
                        href={item.receipt_public_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        領収書
                      </a>
                    </Button>
                  ) : (
                    <span>{"—"}</span>
                  )}
                </div>

                {/* Evidence link */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground font-medium min-w-[56px]">根拠書類:</span>
                  {item.evidence_public_url ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={item.evidence_public_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        確認する
                      </a>
                    </Button>
                  ) : (
                    <span className="text-sm">{"—"}</span>
                  )}
                </div>

                {/* Action buttons (edit/delete) */}
                {(canEdit || canDelete) && (
                  <div className="flex items-center gap-1 pt-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">メニューを開く</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && (
                          <DropdownMenuItem onClick={() => onEditClick(item)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            編集
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              onDeleteClick(item);
                            }}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            削除
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
