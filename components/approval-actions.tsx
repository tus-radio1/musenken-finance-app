"use client";

/**
 * 取引の承認/却下ボタン。
 *
 * 承認フロー許可遷移:
 *   pending → approved  (グローバル管理者 or 対象グループ leader)
 *   pending → rejected  (同上)
 * 制約: 自分の申請は承認不可 (isMyTransaction で制御)。
 * サーバー側の権限チェックは app/actions.ts の updateTransactionStatus が二重に行う。
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2 } from "lucide-react";
import { updateTransactionStatus } from "@/app/actions";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/status-badge";

type Props = {
  transactionId: string;
  status: string;
  canApprove: boolean;
  isMyTransaction: boolean;
  /** 将来の承認条件分岐用（金額閾値による承認フロー等） */
  amount?: number;
};

export function ApprovalActions({
  transactionId,
  status,
  canApprove,
  isMyTransaction,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  amount: _amount,
}: Props) {
  const [loading, setLoading] = useState(false);

  // 将来拡張(部全体会計): transaction_kind = "transfer" の場合、
  // ペアとなる2行を同時に承認/却下する追加ロジックが必要。
  // cf. docs/club-wide-ledger-spec.md — 承認フロー
  const handleAction = async (newStatus: "approved" | "rejected") => {
    if (
      !confirm(newStatus === "approved" ? "承認しますか？" : "却下しますか？")
    )
      return;

    setLoading(true);
    const res = await updateTransactionStatus(transactionId, newStatus);
    setLoading(false);

    if ("error" in res) {
      toast.error(res.error);
    } else {
      toast.success(newStatus === "approved" ? "承認しました" : "却下しました");
      window.dispatchEvent(new Event("ledger-refresh"));
    }
  };

  if (status !== "pending" || !canApprove || isMyTransaction) {
    return <StatusBadge status={status} />;
  }

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => handleAction("approved")}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>承認する</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => handleAction("rejected")}
              disabled={loading}
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>却下する</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
