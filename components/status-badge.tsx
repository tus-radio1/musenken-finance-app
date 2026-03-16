import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  let text = status;
  let defaultClassName = "bg-secondary text-secondary-foreground";
  let tooltip = "ステータス情報";

  switch (status) {
    case "approved":
      text = "承認済";
      defaultClassName = "bg-green-500 hover:bg-green-600 text-white border-transparent";
      tooltip = "申請内容が承認され、次の処理へ進みます";
      break;
    case "rejected":
      text = "却下";
      defaultClassName = "bg-red-500 hover:bg-red-600 text-white border-transparent";
      tooltip = "申請が却下されました";
      break;
    case "accepted":
    case "accounting_received":
      text = "受付済";
      defaultClassName = "bg-blue-500 hover:bg-blue-600 text-white border-transparent";
      tooltip = "担当者が申請を受理しました";
      break;
    case "receipt_received":
      text = "領収書受領済";
      defaultClassName = "bg-teal-500 hover:bg-teal-600 text-white border-transparent";
      tooltip = "領収書の提出が確認されました";
      break;
    case "refunded":
    case "paid":
      text = "返金済(支払済)";
      defaultClassName = "bg-slate-500 hover:bg-slate-600 text-white border-transparent";
      tooltip = "金額の支払・返金が完了しました";
      break;
    case "received":
      text = "受領済";
      defaultClassName = "bg-slate-500 hover:bg-slate-600 text-white border-transparent";
      tooltip = "金額の受領が完了しました";
      break;
    case "receipt_submitted":
      text = "領収書提出済";
      defaultClassName = "bg-emerald-500 hover:bg-emerald-600 text-white border-transparent";
      tooltip = "審査を通過し、領収書が提出されました";
      break;
    case "unexecuted":
      text = "未執行";
      defaultClassName = "bg-gray-500 hover:bg-gray-600 text-white border-transparent";
      tooltip = "まだ執行処理が行われていません";
      break;
    case "application_rejected":
      text = "申請拒否";
      defaultClassName = "bg-red-400 hover:bg-red-500 text-white border-transparent";
      tooltip = "申請内容の不備等により拒否されました";
      break;
    case "application_in_progress":
    case "pending":
    default:
      text = "受付中";
      defaultClassName = "bg-yellow-500 hover:bg-yellow-600 text-white border-transparent";
      tooltip = "申請が提出され、確認待ちの状態です";
      break;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={cn("cursor-help", defaultClassName, className)}>
            {text}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
