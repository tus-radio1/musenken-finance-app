"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Settings2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
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
import { Label } from "@/components/ui/label";
import { assignGroupRole, removeGroupRole } from "@/app/admin/actions";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ROLE_TYPES } from "@/lib/roles/constants";

type Props = {
  userId: string;
  currentTeams: Array<{ id: string; name: string; type: "general" | "leader" }>;
  allCategories: Array<{ id: string; name: string }>;
};

export function TeamManager({ userId, currentTeams, allCategories }: Props) {
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedRole, setSelectedRole] = useState<"general" | "leader">(
    ROLE_TYPES.GENERAL as "general"
  );
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!selectedCategory) return;
    setLoading(true);
    const res = await assignGroupRole(userId, selectedCategory, selectedRole);
    if ((res as any).error) toast.error("追加失敗");
    else toast.success("チームに追加しました");
    setLoading(false);
  };

  const handleRemove = async (catId: string) => {
    if (!confirm("本当に削除しますか？")) return;
    const res = await removeGroupRole(userId, catId);
    if ((res as any).error) toast.error("削除失敗");
    else toast.success("削除しました");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>所属グループの管理</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex gap-2 items-end border-b pb-4">
            <div className="grid gap-2 flex-1">
              <Label>会計グループ</Label>
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger>
                  <SelectValue placeholder="グループを選択" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 w-[100px]">
              <Label>役割</Label>
              <Select
                value={selectedRole}
                onValueChange={(v) =>
                  setSelectedRole(v as "leader" | "general")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROLE_TYPES.GENERAL}>メンバー</SelectItem>
                  <SelectItem value={ROLE_TYPES.LEADER}>リーダー</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={loading || !selectedCategory}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label>現在の所属</Label>
            {currentTeams.length === 0 && (
              <p className="text-sm text-gray-500">所属なし</p>
            )}
            <div className="flex flex-col gap-2">
              {currentTeams.map((tm) => (
                <div
                  key={tm.id}
                  className="flex justify-between items-center bg-background p-2 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tm.name}</span>
                    <Badge
                      variant={tm.type === ROLE_TYPES.LEADER ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {tm.type === ROLE_TYPES.LEADER ? "リーダー" : "メンバー"}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500"
                    onClick={() => handleRemove(tm.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
