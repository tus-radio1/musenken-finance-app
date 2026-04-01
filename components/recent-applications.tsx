"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatStoredDate } from "@/lib/date";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(
    amount,
  );

type Item = {
  id: string;
  date: string;
  description: string;
  amount: number;
  approval_status: string;
};

export function RecentApplications({ items }: { items: Item[] }) {
  return (
    <Card>
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
                  <span>{formatStoredDate(item.date)}</span>
                  <span>・</span>
                  <StatusBadge status={item.approval_status} className="text-[10px] px-1.5 py-0" />
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
