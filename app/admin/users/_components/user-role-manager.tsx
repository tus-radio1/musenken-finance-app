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
import { ROLE_TYPES } from "@/lib/roles/constants";

export function UserRoleManager({
  userId,
  isAdmin,
}: {
  userId: string;
  isAdmin: boolean;
}) {
  const [value, setValue] = useState<string>(isAdmin ? ROLE_TYPES.ADMIN : ROLE_TYPES.GENERAL);
  const [loading, setLoading] = useState(false);

  const handleChange = async (newValue: string) => {
    setLoading(true);
    const result = await setGlobalAdmin(userId, newValue === ROLE_TYPES.ADMIN);
    if ((result as any).error) {
      toast.error("更新失敗");
      setValue(isAdmin ? ROLE_TYPES.ADMIN : ROLE_TYPES.GENERAL);
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
        <SelectItem value={ROLE_TYPES.GENERAL}>一般</SelectItem>
        <SelectItem value={ROLE_TYPES.ADMIN}>管理者</SelectItem>
      </SelectContent>
    </Select>
  );
}
