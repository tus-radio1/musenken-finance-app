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
import { StatusBadge } from "@/components/status-badge";

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
