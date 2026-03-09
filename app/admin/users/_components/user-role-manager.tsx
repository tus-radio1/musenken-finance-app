"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setGlobalAdmin } from "@/app/admin/actions";
import { toast } from "sonner";

export function UserRoleManager({
  userId,
  isAdmin,
}: {
  userId: string;
  isAdmin: boolean;
}) {
  const [value, setValue] = useState(isAdmin ? "admin" : "general");
  const [loading, setLoading] = useState(false);

  const handleChange = async (newValue: string) => {
    setLoading(true);
    const result = await setGlobalAdmin(userId, newValue === "admin");
    if ((result as any).error) {
      toast.error("更新失敗");
      setValue(isAdmin ? "admin" : "general");
    } else {
      toast.success("権限を更新しました");
      setValue(newValue);
    }
    setLoading(false);
  };

  return (
    <Select value={value} onValueChange={handleChange} disabled={loading}>
      <SelectTrigger className="w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="general">一般</SelectItem>
        <SelectItem value="admin">管理者</SelectItem>
      </SelectContent>
    </Select>
  );
}
