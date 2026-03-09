"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { adminResetPassword } from "@/app/admin/create-user";
import { deriveInitialPassword } from "@/lib/account";

export function ResetPasswordButton({
  userId,
  studentNumber,
}: {
  userId: string;
  studentNumber: string;
}) {
  const [loading, setLoading] = useState(false);

  const onReset = async () => {
    if (!confirm("初期パスワードにリセットします。よろしいですか？")) return;
    setLoading(true);
    try {
      const newPw = deriveInitialPassword(studentNumber);
      const res = await adminResetPassword(userId, newPw);
      if ((res as any).error) {
        toast.error((res as any).error);
      } else {
        toast.success("パスワードを初期値にリセットしました");
      }
    } catch (e) {
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
      初期PWにリセット
    </Button>
  );
}
