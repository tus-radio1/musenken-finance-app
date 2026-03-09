"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { deriveEmail } from "@/lib/account";

export default function LoginPage() {
  const router = useRouter();
  const [studentNumber, setStudentNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useCampusEmail] = useState(true);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const supabase = createClient();

    try {
      // 入力バリデーション（学籍番号は7桁の半角数字）
      if (!/^[0-9]{7}$/.test(studentNumber)) {
        toast.error("学籍番号は7桁の数字で入力してください");
        setIsLoading(false);
        return;
      }
      // 学籍番号からメールを合成してログイン
      const email = deriveEmail(studentNumber, useCampusEmail);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      console.log("[auth] user signed in", data?.user);

      toast.success("ログインしました");
      router.push("/");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || "認証エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>ログイン</CardTitle>
          <CardDescription>学籍番号でログインしてください</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="student_number">学籍番号（7桁）</Label>
              <Input
                id="student_number"
                type="text"
                placeholder="4624113"
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]{7}"
                maxLength={7}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ログイン
            </Button>
            <div className="text-center text-xs text-muted-foreground">
              パスワードを忘れた場合は管理者に連絡してください。
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
