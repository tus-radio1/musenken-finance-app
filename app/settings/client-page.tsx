"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUserPassword } from "./actions";

export function SettingsClient({ fullName }: { fullName: string }) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  const handlePasswordUpdate = async () => {
    if (!password || !confirmPassword) {
      toast.error("パスワードを入力してください");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("パスワードが一致しません");
      return;
    }

    if (password.length < 6) {
      toast.error("パスワードは6文字以上である必要があります");
      return;
    }

    setIsUpdating(true);
    const result = await updateUserPassword(password);
    setIsUpdating(false);

    if (result.success) {
      toast.success("パスワードを更新しました");
      setPassword("");
      setConfirmPassword("");
    } else {
      toast.error(`エラー: ${result.error}`);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ユーザーアイコン設定 */}
      <Card>
        <CardHeader>
          <CardTitle>プロフィール画像</CardTitle>
          <CardDescription>
            あなたのユーザーアイコンは名前の頭文字を使用して自動生成されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src="" alt={fullName} />
              <AvatarFallback className="text-2xl">
                {fullName?.slice(0, 2) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="text-sm text-muted-foreground">
              現在の設定ではアイコン画像のアップロードは無効化されています。
            </div>
          </div>
        </CardContent>
      </Card>

      {/* パスワード設定 */}
      <Card>
        <CardHeader>
          <CardTitle>パスワードの変更</CardTitle>
          <CardDescription>
            アカウントのセキュリティを保つために、定期的な変更をお勧めします。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">新しいパスワード</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">新しいパスワード（確認）</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handlePasswordUpdate} disabled={isUpdating}>
            {isUpdating ? "更新中..." : "パスワードを更新"}
          </Button>
        </CardFooter>
      </Card>

      {/* 外観設定 */}
      <Card>
        <CardHeader>
          <CardTitle>外観設定</CardTitle>
          <CardDescription>
            アプリケーションのテーマ（ダークモード）を設定します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-[200px]">
            <Label htmlFor="theme">テーマ</Label>
            {mounted ? (
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger id="theme">
                  <SelectValue placeholder="テーマを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">ライト</SelectItem>
                  <SelectItem value="dark">ダーク</SelectItem>
                  <SelectItem value="system">システム</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select disabled>
                <SelectTrigger id="theme-loading">
                  <SelectValue placeholder="読み込み中..." />
                </SelectTrigger>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
