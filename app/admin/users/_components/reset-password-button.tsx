"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { adminResetPassword } from "@/app/admin/create-user";

export function ResetPasswordButton({
  userId,
}: {
  userId: string;
}) {
  const [loading, setLoading] = useState(false);

  const onReset = async () => {
    if (!confirm("パスワードをリセットします。よろしいですか？")) return;
    setLoading(true);
    try {
      const res = await adminResetPassword(userId);
      if ("error" in res) {
        toast.error(res.error);
      } else {
        toast.success(
          `パスワードをリセットしました。新しいパスワード: ${res.newPassword}`,
          { duration: 15000 },
        );
      }
    } catch {
      toast.error("リセットに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={onReset} disabled={loading}>
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <RotateCcw className="mr-2 h-4 w-4" />
      )}
      PWリセット
    </Button>
  );
}
