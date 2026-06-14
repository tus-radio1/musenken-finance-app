"use client";

/**
 * Club-wide ledger summary cards.
 * Shows: income, expense, balance, wallet balances, and transfer total.
 */

import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClubLedgerSummary as ClubSummaryType } from "@/lib/ledger";
import type { FinancialAccountInfo } from "./types";

type Props = {
  summary: ClubSummaryType;
  financialAccounts: FinancialAccountInfo[];
};

export function ClubLedgerSummary({ summary, financialAccounts }: Props) {
  const totalBalance = Object.values(summary.walletBalances).reduce(
    (sum, v) => sum + v,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>部全体集計</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Income / Expense / Balance */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-muted rounded p-4">
            <div className="text-sm text-muted-foreground">部全体収入</div>
            <div className="text-xl font-semibold text-green-600">
              {formatCurrency(summary.income)}
            </div>
          </div>
          <div className="bg-muted rounded p-4">
            <div className="text-sm text-muted-foreground">部全体支出</div>
            <div className="text-xl font-semibold text-red-600">
              {formatCurrency(summary.expense)}
            </div>
          </div>
          <div className="bg-muted rounded p-4">
            <div className="text-sm text-muted-foreground">収支差額</div>
            <div
              className={`text-xl font-semibold ${summary.balance < 0 ? "text-red-600" : ""}`}
            >
              {formatCurrency(summary.balance)}
            </div>
          </div>
        </div>

        {/* Wallet balances */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {financialAccounts.map((fa) => (
            <div key={fa.id} className="bg-muted rounded p-4">
              <div className="text-sm text-muted-foreground">
                {fa.name}残高
              </div>
              <div className="text-xl font-semibold">
                {formatCurrency(summary.walletBalances[fa.id] || 0)}
              </div>
            </div>
          ))}
          <div className="bg-muted rounded p-4">
            <div className="text-sm text-muted-foreground">合計残高</div>
            <div className="text-xl font-semibold">
              {formatCurrency(totalBalance)}
            </div>
          </div>
        </div>

        {/* Transfer total */}
        {summary.transferTotal > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-4">
              <div className="text-sm text-muted-foreground">
                当年度資金移動総額
              </div>
              <div className="text-xl font-semibold text-blue-600">
                {formatCurrency(summary.transferTotal)}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
