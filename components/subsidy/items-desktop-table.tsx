"use client";

/**
 * 支援金申請一覧: デスクトップテーブル (xl以上で表示)
 * ソート・詳細展開・操作メニューを含むテーブル表示。
 */

import { Fragment } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "@/lib/constants/subsidy";
import type { SubsidyItem, SortKey } from "./types";

type ItemsDesktopTableProps = {
  items: SubsidyItem[];
  openCards: Set<string>;
  onToggleCard: (id: string) => void;
  onToggleSort: (key: SortKey) => void;
  onEditClick: (item: SubsidyItem) => void;
  onDeleteClick: (item: SubsidyItem) => void;
  isGlobalAdmin: boolean;
};

export function ItemsDesktopTable({
  items,
  openCards,
  onToggleCard,
  onToggleSort,
  onEditClick,
  onDeleteClick,
  isGlobalAdmin,
}: ItemsDesktopTableProps) {
  return (
    <div className="hidden xl:block">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-3 font-medium"
                  onClick={() => onToggleSort("created_at")}
                >
                  申請日
                  <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </TableHead>
              <TableHead>カテゴリ</TableHead>
              <TableHead>項目名</TableHead>
              <TableHead>会計区分</TableHead>
              <TableHead>使用時期</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-3 font-medium"
                  onClick={() => onToggleSort("requested_amount")}
                >
                  申請金額
                  <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </TableHead>
              <TableHead>算定額</TableHead>
              <TableHead className="w-[100px]">状態</TableHead>
              <TableHead className="w-[120px]">添付書類</TableHead>
              <TableHead className="w-[60px]">詳細</TableHead>
              <TableHead className="w-[60px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const canEdit =
                isGlobalAdmin || item.status === "pending" || item.status === "approved";
              const canDelete =
                isGlobalAdmin || item.status === "pending";
              return (
                <Fragment key={item.id}>
                <TableRow>
                  <TableCell className="font-medium">
                    {formatStoredDate(item.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </Badge>
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        第{item.term}期
                      </Badge>
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {EXPENSE_TYPE_LABELS[item.expense_type] || item.expense_type}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell
                    className="max-w-[200px] truncate"
                    title={item.name}
                  >
                    {item.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {item.accounting_group_name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.usage_period || "—"}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatCurrency(item.requested_amount)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.approved_amount != null
                      ? formatCurrency(item.approved_amount)
                      : "-"}
                  </TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell className="w-[120px]">
                    <div className="flex flex-col gap-1">
                      {item.receipt_public_url ? (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                          <a href={item.receipt_public_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            領収書
                          </a>
                        </Button>
                      ) : null}
                      {item.evidence_public_url ? (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                          <a href={item.evidence_public_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            根拠書類
                          </a>
                        </Button>
                      ) : null}
                      {!item.receipt_public_url && !item.evidence_public_url && (
                        <span className="text-muted-foreground">{"—"}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => onToggleCard(item.id)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          openCards.has(item.id) ? "rotate-180" : ""
                        }`}
                      />
                    </Button>
                  </TableCell>
                  <TableCell>
                    {(canEdit || canDelete) && (
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
                    )}
                  </TableCell>
                </TableRow>
                {openCards.has(item.id) && (
                  <TableRow key={`${item.id}-detail`} className="bg-muted/30">
                    <TableCell colSpan={11} className="py-2 px-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                        {item.justification && (
                          <div className="col-span-2">
                            <span className="font-medium text-muted-foreground">申請理由: </span>
                            <span className="whitespace-pre-wrap break-words">{item.justification}</span>
                          </div>
                        )}
                        <div className="col-span-2">
                          <span className="font-medium text-muted-foreground">備考: </span>
                          <span className="whitespace-pre-wrap break-words">{item.remarks || "—"}</span>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
