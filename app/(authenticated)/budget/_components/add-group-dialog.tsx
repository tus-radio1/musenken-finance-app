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
import { createAccountingGroup } from "../actions";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";

interface AddGroupDialogProps {
  fiscalYear: number;
}

export function AddGroupDialog({ fiscalYear }: AddGroupDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("0");
  const [carryover, setCarryover] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setName("");
      setType("");
      setAmount("0");
      setCarryover("0");
      setError(null);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      setError("グループ名を入力してください");
      return;
    }
    if (!type.trim()) {
      setError("種別を入力してください");
      return;
    }
    const numAmount = Number(amount);
    if (Number.isNaN(numAmount) || numAmount < 0) {
      setError("有効な予算額を入力してください");
      return;
    }
    const numCarryover = Number(carryover) || 0;

    setError(null);
    startTransition(async () => {
      const result = await createAccountingGroup(
        name.trim(),
        type.trim(),
        fiscalYear,
        numAmount,
        numCarryover,
      );
      if (result.error && !result.success) {
        setError(result.error);
      } else {
        handleOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusCircle className="h-4 w-4 mr-1.5" />
          会計グループを追加
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>会計グループを追加</DialogTitle>
          <DialogDescription>
            新しい会計グループを作成し、{fiscalYear}年度の予算を設定します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="add-group-name">グループ名 *</Label>
            <Input
              id="add-group-name"
              placeholder="例: 広報グループ"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-group-type">種別 *</Label>
            <Input
              id="add-group-type"
              placeholder="例: 部門"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-group-amount">予算額（円）</Label>
            <Input
              id="add-group-amount"
              type="number"
              min={0}
              step={100}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-group-carryover">繰入金（円）</Label>
            <Input
              id="add-group-carryover"
              type="number"
              min={0}
              step={100}
              placeholder="0"
              value={carryover}
              onChange={(e) => setCarryover(e.target.value)}
            />
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
