"use client";

/**
 * 出納帳のサマリーカード（予算額・繰入金・収入合計・支出合計・予算残高）。
 */

import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  budgetAmount: number;
  carryoverAmount: number;
  totals: { income: number; expense: number; budgetRemaining: number };
};

export function LedgerSummary({ budgetAmount, carryoverAmount, totals }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>集計</CardTitle>
      </CardHeader>
      {/* 将来拡張(部全体会計): 部全体会計グループ選択時は財布別残高
          (金庫残高・銀行口座残高・合計残高) のカードを追加表示する。
          Props に financialAccountBalances?: Record<string, number> を追加予定。
          cf. docs/club-wide-ledger-spec.md */}
      <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-muted rounded p-4">
          <div className="text-sm text-muted-foreground">今年度予算額</div>
          <div className="text-xl font-semibold">
            {formatCurrency(Number(budgetAmount) || 0)}
          </div>
        </div>
        <div className="bg-muted rounded p-4">
          <div className="text-sm text-muted-foreground">繰入金</div>
          <div className="text-xl font-semibold">
            {formatCurrency(Number(carryoverAmount) || 0)}
          </div>
        </div>
        <div className="bg-muted rounded p-4">
          <div className="text-sm text-muted-foreground">収入合計</div>
          <div className="text-xl font-semibold">
            {formatCurrency(totals.income)}
          </div>
        </div>
        <div className="bg-muted rounded p-4">
          <div className="text-sm text-muted-foreground">支出合計</div>
          <div className="text-xl font-semibold">
            {formatCurrency(totals.expense)}
          </div>
        </div>
        <div className="bg-muted rounded p-4">
          <div className="text-sm text-muted-foreground">今年度予算残高</div>
          <div
            className={`text-xl font-semibold ${totals.budgetRemaining < 0 ? "text-red-600" : ""}`}
          >
            {formatCurrency(totals.budgetRemaining)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
