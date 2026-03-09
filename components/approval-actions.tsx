"use client";

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

type Props = {
  transactionId: string;
  status: string;
  canApprove: boolean;
  isMyTransaction: boolean;
  amount: number;
};

export function ApprovalActions({
  transactionId,
  status,
  canApprove,
  isMyTransaction,
  amount,
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleAction = async (newStatus: "approved" | "rejected") => {
    if (
      !confirm(newStatus === "approved" ? "承認しますか？" : "却下しますか？")
    )
      return;

    setLoading(true);
    const res = await updateTransactionStatus(transactionId, newStatus);
    setLoading(false);

    if ((res as any).error) {
      toast.error((res as any).error);
    } else {
      toast.success(newStatus === "approved" ? "承認しました" : "却下しました");
      window.dispatchEvent(new Event("ledger-refresh"));
    }
  };

  if (status !== "pending") {
    switch (status) {
      case "approved":
        return (
          <span className="text-green-600 text-xs font-bold flex items-center">
            <Check className="h-3 w-3 mr-1" />
            承認済
          </span>
        );
      case "rejected":
        return (
          <span className="text-red-600 text-xs font-bold flex items-center">
            <X className="h-3 w-3 mr-1" />
            却下
          </span>
        );
      case "accepted":
        return (
          <span className="text-blue-600 text-xs font-bold flex items-center">
            受付済
          </span>
        );
      case "refunded":
        return (
          <span className="text-slate-600 text-xs font-bold flex items-center">
            {amount >= 0 ? "受領済" : "返金済"}
          </span>
        );
      case "received":
        return (
          <span className="text-slate-600 text-xs font-bold flex items-center">
            受領済
          </span>
        );
      default:
        break; // If custom status or unknown, fallthrough to pending logic
    }
  }

  if (!canApprove || isMyTransaction) {
    return (
      <span className="text-yellow-600 text-xs font-bold flex items-center">
        受付中
      </span>
    );
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
