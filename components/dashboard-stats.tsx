"use client";

import { Card, CardContent } from "@/components/ui/card";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(
    amount,
  );

type Props = {
  totalCountThisYear: number;
  pendingCountThisYear: number;
  approvedCountThisYear: number;
  totalAmountThisYear: number;
};

export function DashboardStats({
  totalCountThisYear,
  pendingCountThisYear,
  approvedCountThisYear,
  totalAmountThisYear,
}: Props) {
  return (
    <div className="grid gap-4 grid-cols-1">
      <Card className="bg-white">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground mb-1">
            今年度の申請数
          </div>
          <div className="text-2xl font-bold">{totalCountThisYear}</div>
        </CardContent>
      </Card>
      <Card className="bg-white">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground mb-1">申請中の件数</div>
          <div className="text-2xl font-bold text-yellow-600">
            {pendingCountThisYear}
          </div>
        </CardContent>
      </Card>
      <Card className="bg-white">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground mb-1">承認済み件数</div>
          <div className="text-2xl font-bold text-green-600">
            {approvedCountThisYear}
          </div>
        </CardContent>
      </Card>
      <Card className="bg-white">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground mb-1">
            今年度の申請金額
          </div>
          <div className="text-xl font-bold">
            {formatCurrency(totalAmountThisYear)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
