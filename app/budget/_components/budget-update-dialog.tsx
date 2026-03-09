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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { upsertBudget } from "../actions";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

type AccountingGroup = {
  id: string;
  name: string;
  currentBudget: number;
};

interface BudgetUpdateDialogProps {
  groups: AccountingGroup[];
  fiscalYear: number;
}

export function BudgetUpdateDialog({
  groups,
  fiscalYear,
}: BudgetUpdateDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSelectedGroupId("");
      setAmount("");
      setError(null);
    }
  };

  const handleGroupChange = (groupId: string) => {
    setSelectedGroupId(groupId);
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      setAmount(String(group.currentBudget));
    }
  };

  const handleSubmit = () => {
    if (!selectedGroupId) {
      setError("会計区分を選択してください");
      return;
    }
    const numAmount = Number(amount);
    if (Number.isNaN(numAmount) || numAmount < 0) {
      setError("有効な金額を入力してください");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await upsertBudget(selectedGroupId, numAmount, fiscalYear);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setSelectedGroupId("");
        setAmount("");
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-1.5" />
          予算額を更新
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>予算額の更新</DialogTitle>
          <DialogDescription>
            {fiscalYear}年度の会計区分ごとの予算額を更新します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="budget-group">会計区分</Label>
            <Select value={selectedGroupId} onValueChange={handleGroupChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="会計区分を選択..." />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedGroup && (
            <p className="text-xs text-muted-foreground">
              現在の予算額:{" "}
              {new Intl.NumberFormat("ja-JP", {
                style: "currency",
                currency: "JPY",
              }).format(selectedGroup.currentBudget)}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="budget-amount">新しい予算額（円）</Label>
            <Input
              id="budget-amount"
              type="number"
              min={0}
              step={100}
              placeholder="例: 100000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpen(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
