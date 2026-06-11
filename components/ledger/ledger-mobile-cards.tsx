"use client";

/**
 * 出納帳のモバイル用カード表示。xl 未満で表示される。
 */

import { useCallback, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { formatStoredDate } from "@/lib/date";
import { TransactionRowActions } from "@/components/transaction-row-actions";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalActions } from "@/components/approval-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Receipt,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import type { LedgerTransaction } from "./types";

type Props = {
  rows: LedgerTransaction[];
  currentProfileId?: string;
  isAdminOrAccounting: boolean;
  isGlobalAdmin: boolean;
  isReadOnly: boolean;
  categoriesForSelected: Array<{ id: string; name: string }>;
  userRoleStr: "admin" | "accounting" | "general";
  users?: { id: string; name: string }[];
  accountingUserId?: string;
};

export function LedgerMobileCards({
  rows,
  currentProfileId,
  isAdminOrAccounting,
  isGlobalAdmin,
  isReadOnly,
  categoriesForSelected,
  userRoleStr,
  users,
  accountingUserId,
}: Props) {
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

  return (
    <div className="xl:hidden space-y-3">
      {rows.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          取引データがありません
        </div>
      ) : (
        rows.map((r) => {
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
                      {r.date ? formatStoredDate(r.date) : "-"}
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
                      <span>{r.approved_by_name || "—"}</span>
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
                        accountingUserId={accountingUserId}
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
  );
}
