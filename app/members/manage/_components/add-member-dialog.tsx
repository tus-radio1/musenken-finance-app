"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { addMember } from "../actions";

export function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    student_number: "",
    grade: 1,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await addMember(form);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        toast.success("部員を追加しました");
        setForm({ name: "", student_number: "", grade: 1 });
        setOpen(false);
      }
    } catch (err: any) {
      toast.error(err?.message || "入力エラーがあります");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          部員を追加
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>部員を追加</DialogTitle>
          <DialogDescription>
            新しい部員の情報を入力してください。初期パスワードは自動生成されます。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-name">氏名</Label>
            <Input
              id="add-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: 山田太郎"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-student-number">学籍番号（7桁）</Label>
            <Input
              id="add-student-number"
              type="text"
              value={form.student_number}
              onChange={(e) =>
                setForm({ ...form, student_number: e.target.value })
              }
              placeholder="4624113"
              inputMode="numeric"
              pattern="[0-9]{7}"
              maxLength={7}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-grade">学年</Label>
            <Select
              value={String(form.grade)}
              onValueChange={(v) => setForm({ ...form, grade: Number(v) })}
            >
              <SelectTrigger id="add-grade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    {g}年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              追加する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
