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
import { Loader2, Pencil, X, Plus } from "lucide-react";
import { updateMember } from "../actions";

export type RoleOption = {
  id: string;
  name: string;
};

type EditMemberDialogProps = {
  member: {
    id: string;
    name: string;
    student_number: string;
    grade: number;
    role_ids: string[];
  };
  allRoles: RoleOption[];
};

export function EditMemberDialog({ member, allRoles }: EditMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: member.name,
    student_number: member.student_number,
    grade: member.grade,
    role_ids: [...member.role_ids],
  });

  // ダイアログを開くたびにフォームをリセット
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setForm({
        name: member.name,
        student_number: member.student_number,
        grade: member.grade,
        role_ids: [...member.role_ids],
      });
    }
    setOpen(isOpen);
  };

  const addRole = (roleId: string) => {
    if (!form.role_ids.includes(roleId)) {
      setForm({ ...form, role_ids: [...form.role_ids, roleId] });
    }
  };

  const removeRole = (roleId: string) => {
    setForm({ ...form, role_ids: form.role_ids.filter((id) => id !== roleId) });
  };

  const availableRoles = allRoles.filter((r) => !form.role_ids.includes(r.id));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await updateMember(member.id, form);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        toast.success("部員情報を更新しました");
        setOpen(false);
      }
    } catch (err: any) {
      toast.error(err?.message || "更新エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          <Pencil className="h-3.5 w-3.5" />
          編集
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>部員情報を編集</DialogTitle>
          <DialogDescription>
            {member.name} さんの情報を編集します。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`edit-name-${member.id}`}>氏名</Label>
            <Input
              id={`edit-name-${member.id}`}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-sn-${member.id}`}>学籍番号（7桁）</Label>
            <Input
              id={`edit-sn-${member.id}`}
              type="text"
              value={form.student_number}
              onChange={(e) =>
                setForm({ ...form, student_number: e.target.value })
              }
              inputMode="numeric"
              pattern="[0-9]{7}"
              maxLength={7}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-grade-${member.id}`}>学年</Label>
            <Select
              value={String(form.grade)}
              onValueChange={(v) => setForm({ ...form, grade: Number(v) })}
            >
              <SelectTrigger id={`edit-grade-${member.id}`}>
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
          <div className="space-y-2">
            <Label>役職</Label>
            <div className="flex flex-wrap gap-1.5">
              {form.role_ids.length === 0 && (
                <span className="text-sm text-muted-foreground">役職なし</span>
              )}
              {form.role_ids.map((roleId) => {
                const role = allRoles.find((r) => r.id === roleId);
                return (
                  <span
                    key={roleId}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-sm"
                  >
                    {role?.name || roleId}
                    <button
                      type="button"
                      onClick={() => removeRole(roleId)}
                      className="rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
            {availableRoles.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <Select onValueChange={(v) => addRole(v)}>
                  <SelectTrigger className="h-8 w-48 text-sm">
                    <SelectValue placeholder="役職を追加..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
              保存する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
