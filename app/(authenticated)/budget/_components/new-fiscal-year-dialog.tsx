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
import { createFiscalYearBudgets, createAccountingGroup } from "../actions";
import { useRouter } from "next/navigation";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";

type AccountingGroup = {
  id: string;
  name: string;
};

type NewGroup = {
  tempId: string;
  name: string;
  type: string;
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
  const [carryoverAmounts, setCarryoverAmounts] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      groups.forEach((g) => {
        init[g.id] = "0";
      });
      return init;
    },
  );
  const [newGroups, setNewGroups] = useState<NewGroup[]>([]);
  const [newGroupAmounts, setNewGroupAmounts] = useState<Record<string, string>>({});
  const [newGroupCarryovers, setNewGroupCarryovers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setYear(String(suggestedYear));
      const init: Record<string, string> = {};
      const carryoverInit: Record<string, string> = {};
      groups.forEach((g) => {
        init[g.id] = "0";
        carryoverInit[g.id] = "0";
      });
      setBudgetAmounts(init);
      setCarryoverAmounts(carryoverInit);
      setNewGroups([]);
      setNewGroupAmounts({});
      setNewGroupCarryovers({});
      setError(null);
    }
  };

  const handleAmountChange = (groupId: string, value: string) => {
    setBudgetAmounts((prev) => ({ ...prev, [groupId]: value }));
  };

  const handleCarryoverChange = (groupId: string, value: string) => {
    setCarryoverAmounts((prev) => ({ ...prev, [groupId]: value }));
  };

  const handleAddNewGroup = () => {
    const tempId = `new-${Date.now()}`;
    setNewGroups((prev) => [...prev, { tempId, name: "", type: "" }]);
    setNewGroupAmounts((prev) => ({ ...prev, [tempId]: "0" }));
    setNewGroupCarryovers((prev) => ({ ...prev, [tempId]: "0" }));
  };

  const handleNewGroupChange = (tempId: string, field: "name" | "type", value: string) => {
    setNewGroups((prev) =>
      prev.map((g) => (g.tempId === tempId ? { ...g, [field]: value } : g)),
    );
  };

  const handleRemoveNewGroup = (tempId: string) => {
    setNewGroups((prev) => prev.filter((g) => g.tempId !== tempId));
    setNewGroupAmounts((prev) => {
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
    setNewGroupCarryovers((prev) => {
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
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

    // Validate existing groups
    const budgets: { groupId: string; amount: number; carryoverAmount?: number }[] = [];
    for (const g of groups) {
      const amt = Number(budgetAmounts[g.id] || 0);
      if (Number.isNaN(amt) || amt < 0) {
        setError(`「${g.name}」の予算額が不正です`);
        return;
      }
      const carryoverAmt = Number(carryoverAmounts[g.id] || 0);
      if (Number.isNaN(carryoverAmt) || carryoverAmt < 0) {
        setError(`「${g.name}」の繰入金が不正です`);
        return;
      }
      budgets.push({ groupId: g.id, amount: amt, carryoverAmount: carryoverAmt });
    }

    // Validate new groups
    for (const ng of newGroups) {
      if (!ng.name.trim()) {
        setError("追加するグループのグループ名を入力してください");
        return;
      }
      if (!ng.type.trim()) {
        setError(`「${ng.name}」の種別を入力してください`);
        return;
      }
      const amt = Number(newGroupAmounts[ng.tempId] || 0);
      if (Number.isNaN(amt) || amt < 0) {
        setError(`「${ng.name}」の予算額が不正です`);
        return;
      }
      const carryoverAmt = Number(newGroupCarryovers[ng.tempId] || 0);
      if (Number.isNaN(carryoverAmt) || carryoverAmt < 0) {
        setError(`「${ng.name}」の繰入金が不正です`);
        return;
      }
    }

    setError(null);
    startTransition(async () => {
      // Create new groups first (without fiscal year, budgets added via createFiscalYearBudgets)
      for (const ng of newGroups) {
        const result = await createAccountingGroup(ng.name.trim(), ng.type.trim());
        if (result.error && !result.success) {
          setError(result.error);
          return;
        }
        if (result.groupId) {
          const amt = Number(newGroupAmounts[ng.tempId] || 0);
          const carryoverAmt = Number(newGroupCarryovers[ng.tempId] || 0);
          budgets.push({ groupId: result.groupId, amount: amt, carryoverAmount: carryoverAmt });
        }
      }

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
            <Label>各会計区分の予算額・繰入金（円）</Label>
            <p className="text-xs text-muted-foreground mb-2">
              0 のまま残すことも可能です。あとから更新できます。
            </p>
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.id} className="space-y-1.5">
                  <span className="text-sm font-medium truncate block">
                    {g.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">予算額</Label>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        placeholder="0"
                        value={budgetAmounts[g.id] || ""}
                        onChange={(e) => handleAmountChange(g.id, e.target.value)}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">繰入金</Label>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        placeholder="0"
                        value={carryoverAmounts[g.id] || ""}
                        onChange={(e) => handleCarryoverChange(g.id, e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {newGroups.map((ng) => (
                <div key={ng.tempId} className="space-y-1.5 border rounded-md p-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">新規グループ</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleRemoveNewGroup(ng.tempId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">グループ名 *</Label>
                      <Input
                        placeholder="例: 広報グループ"
                        value={ng.name}
                        onChange={(e) => handleNewGroupChange(ng.tempId, "name", e.target.value)}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">種別 *</Label>
                      <Input
                        placeholder="例: 部門"
                        value={ng.type}
                        onChange={(e) => handleNewGroupChange(ng.tempId, "type", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">予算額</Label>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        placeholder="0"
                        value={newGroupAmounts[ng.tempId] || ""}
                        onChange={(e) =>
                          setNewGroupAmounts((prev) => ({ ...prev, [ng.tempId]: e.target.value }))
                        }
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">繰入金</Label>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        placeholder="0"
                        value={newGroupCarryovers[ng.tempId] || ""}
                        onChange={(e) =>
                          setNewGroupCarryovers((prev) => ({ ...prev, [ng.tempId]: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 w-full border border-dashed"
              onClick={handleAddNewGroup}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              会計グループを追加
            </Button>
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
