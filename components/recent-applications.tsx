"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(
    amount,
  );

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP");

function statusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case "approved":
      return {
        text: "承認済",
        className: "bg-green-500 hover:bg-green-600 text-white",
      };
    case "rejected":
      return {
        text: "却下",
        className: "bg-red-500 hover:bg-red-600 text-white",
      };
    case "accepted":
      return {
        text: "受付済",
        className: "bg-blue-500 hover:bg-blue-600 text-white",
      };
    case "checking":
      return {
        text: "確認中",
        className: "bg-indigo-500 hover:bg-indigo-600 text-white",
      };
    case "receipt_received":
      return {
        text: "領収書受領済",
        className: "bg-teal-500 hover:bg-teal-600 text-white",
      };
    case "refunded":
      return {
        text: "返金済",
        className: "bg-slate-500 hover:bg-slate-600 text-white",
      };
    case "received":
      return {
        text: "受領済",
        className: "bg-slate-500 hover:bg-slate-600 text-white",
      };
    case "pending":
    default:
      return {
        text: "申請中",
        className: "bg-yellow-500 hover:bg-yellow-600 text-white",
      };
  }
}

type Item = {
  id: string;
  date: string;
  description: string;
  amount: number;
  approval_status: string;
};

export function RecentApplications({ items }: { items: Item[] }) {
  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          あなたの申請状況（直近5件）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            申請はまだありません。
          </p>
        )}
        {items.map((item) => {
          const { text, className } = statusLabel(item.approval_status);
          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-xs"
            >
              <div className="flex-1 min-w-0 mr-3">
                <div className="font-medium mb-0.5 truncate">
                  {item.description}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <span>{formatDate(item.date)}</span>
                  <span>・</span>
                  <Badge className={`text-[10px] px-1.5 py-0 ${className}`}>
                    {text}
                  </Badge>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold">
                  {formatCurrency(item.amount)}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
