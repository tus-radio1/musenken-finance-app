"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createFiscalYearBudgets } from "../actions";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";

type AccountingGroup = {
  id: string;
  name: string;
};

interface NewFiscalYearDialogProps {
  groups: AccountingGroup[];
  existingYears: number[];
}

export function NewFiscalYearDialog({
  groups,
  existingYears,
}: NewFiscalYearDialogProps) {
  const currentCalendarYear = new Date().getFullYear();
  const suggestedYear =
    existingYears.length > 0
      ? Math.max(...existingYears) + 1
      : currentCalendarYear;

  const [open, setOpen] = useState(false);
  const [year, setYear] = useState<string>(String(suggestedYear));
  const [budgetAmounts, setBudgetAmounts] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      groups.forEach((g) => {
        init[g.id] = "0";
      });
      return init;
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setYear(String(suggestedYear));
      const init: Record<string, string> = {};
      groups.forEach((g) => {
        init[g.id] = "0";
      });
      setBudgetAmounts(init);
      setError(null);
    }
  };

  const handleAmountChange = (groupId: string, value: string) => {
    setBudgetAmounts((prev) => ({ ...prev, [groupId]: value }));
  };

  const handleSubmit = () => {
    const numYear = Number(year);
    if (Number.isNaN(numYear) || numYear < 2000 || numYear > 2100) {
      setError("有効な年度を入力してください");
      return;
    }
    if (existingYears.includes(numYear)) {
      setError(`${numYear}年度は既に存在します`);
      return;
    }

    const budgets: { groupId: string; amount: number }[] = [];
    for (const g of groups) {
      const amt = Number(budgetAmounts[g.id] || 0);
      if (Number.isNaN(amt) || amt < 0) {
        setError(`「${g.name}」の金額が不正です`);
        return;
      }
      budgets.push({ groupId: g.id, amount: amt });
    }

    setError(null);
    startTransition(async () => {
      const result = await createFiscalYearBudgets(numYear, budgets);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.push(`/budget?year=${numYear}`);
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarPlus className="h-4 w-4 mr-1.5" />
          新規年度の予算を設定
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新規年度の予算設定</DialogTitle>
          <DialogDescription>
            新しい会計年度を作成し、各会計区分の予算額を設定します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-fy-year">年度</Label>
            <Input
              id="new-fy-year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>各会計区分の予算額（円）</Label>
            <p className="text-xs text-muted-foreground mb-2">
              0 のまま残すことも可能です。あとから更新できます。
            </p>
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.id} className="flex items-center gap-3">
                  <span className="text-sm w-40 shrink-0 truncate">
                    {g.name}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    placeholder="0"
                    value={budgetAmounts[g.id] || ""}
                    onChange={(e) => handleAmountChange(g.id, e.target.value)}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpen(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "作成中..." : "作成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
