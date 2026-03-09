"use client";

import { useState } from "react";
import { z } from "zod";
import { createUserSchema } from "@/lib/account";
import { adminCreateUser } from "@/app/admin/create-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function CreateUserForm() {
  const [form, setForm] = useState({
    name: "",
    student_number: "",
    grade: 1,
    useCampusEmail: true,
  });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const parsed = createUserSchema.parse(form);
      const res = await adminCreateUser(parsed);
      if ((res as any).error) {
        toast.error((res as any).error);
      } else {
        toast.success("ユーザーを作成しました");
        setForm({
          name: "",
          student_number: "",
          grade: 1,
          useCampusEmail: true,
        });
      }
    } catch (err: any) {
      toast.error(err?.message || "入力エラーがあります");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="name">氏名</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: 山田太郎"
              required
            />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="student_number">学籍番号（7桁）</Label>
            <Input
              id="student_number"
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
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="grade">学年</Label>
            <Input
              id="grade"
              type="number"
              value={form.grade}
              onChange={(e) =>
                setForm({ ...form, grade: Number(e.target.value) })
              }
              min={1}
              max={4}
              required
            />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={form.useCampusEmail}
                onCheckedChange={(v) =>
                  setForm({ ...form, useCampusEmail: Boolean(v) })
                }
              />
              学内メールを使用（student@ed.tus.ac.jp）
            </Label>
          </div>
          <div className="md:col-span-4">
            <Button
              type="submit"
              disabled={loading}
              className="w-full md:w-auto"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              追加する
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
