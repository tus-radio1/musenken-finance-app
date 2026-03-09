"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

type BudgetStatus = {
  category_id: string;
  category_name: string;
  budget_amount: number;
  expenses: number;
  pending: number;
};

const COLORS = {
  remaining: "#9ca3af", // 灰色 - 残高
  expenses: "#22c55e", // 緑色 - 支出額（返金済）
  pending: "#eab308", // 黄色 - 申請中（受付中、受付済、承認済）
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
};

function BudgetPieChart({
  remaining,
  expenses,
  pending,
}: {
  remaining: number;
  expenses: number;
  pending: number;
}) {
  const data = [
    { name: "支出額", value: Math.max(0, expenses) },
    { name: "申請中", value: pending },
    { name: "残高", value: Math.max(0, remaining) },
  ].filter((d) => d.value > 0);

  const colors = [COLORS.expenses, COLORS.pending, COLORS.remaining];
  // data にフィルタ後の色を対応させる
  const filteredColors: string[] = [];
  const allEntries = [
    { value: Math.max(0, expenses), color: COLORS.expenses },
    { value: pending, color: COLORS.pending },
    { value: Math.max(0, remaining), color: COLORS.remaining },
  ];
  allEntries.forEach((e) => {
    if (e.value > 0) filteredColors.push(e.color);
  });

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[140px] text-sm text-muted-foreground">
        データなし
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={35}
          outerRadius={60}
          dataKey="value"
          strokeWidth={2}
          stroke="#fff"
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={filteredColors[index]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
          contentStyle={{
            borderRadius: "8px",
            fontSize: "12px",
            padding: "6px 10px",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BudgetOverview({ data }: { data: BudgetStatus[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {data.map((item) => {
        const expenses = item.expenses;
        const pending = item.pending;
        const totalUsed = expenses + pending;
        const remaining = item.budget_amount - totalUsed;

        const usagePercent =
          item.budget_amount > 0
            ? Math.min(100, Math.round((totalUsed / item.budget_amount) * 100))
            : totalUsed > 0
              ? 100
              : 0;

        let statusText = "健全";
        if (usagePercent >= 100) {
          statusText = "予算超過";
        } else if (usagePercent >= 80) {
          statusText = "注意";
        }

        return (
          <Card key={item.category_id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {item.category_name}
              </CardTitle>
              <Badge variant={usagePercent >= 100 ? "destructive" : "outline"}>
                {statusText}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(remaining)}
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  残高
                </span>
              </div>

              <BudgetPieChart
                remaining={remaining}
                expenses={expenses}
                pending={pending}
              />

              {/* 凡例 */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-2">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: COLORS.expenses }}
                  />
                  支出額
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: COLORS.pending }}
                  />
                  申請中
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: COLORS.remaining }}
                  />
                  残高
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
