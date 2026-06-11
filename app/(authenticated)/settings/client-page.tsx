"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// Hydration-safe "mounted" detection without set-state-in-effect (E-3)
const noop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

// パスワード要件（サーバー側 updateUserPasswordSchema と同一条件）
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

export function SettingsClient({ fullName }: { fullName: string }) {
  const mounted = useSyncExternalStore(noop, getTrue, getFalse);
  const { theme, setTheme } = useTheme();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const handlePasswordUpdate = async () => {
    if (!password || !confirmPassword) {
      toast.error("パスワードを入力してください");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("パスワードが一致しません");
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      toast.error("パスワードは8文字以上で入力してください");
      return;
    }

    if (!PASSWORD_PATTERN.test(password)) {
      toast.error(
        "パスワードには大文字・小文字・数字をそれぞれ1文字以上含めてください",
      );
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
      toast.error(`パスワードの更新に失敗しました: ${result.error}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* アカウント情報 */}
      {fullName && (
        <Card>
          <CardHeader>
            <CardTitle>アカウント情報</CardTitle>
            <CardDescription>
              ログイン中のアカウント情報です。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label className="text-muted-foreground">氏名</Label>
              <p className="text-sm font-medium">{fullName}</p>
            </div>
          </CardContent>
        </Card>
      )}

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
            <p className="text-xs text-muted-foreground">
              8文字以上、大文字・小文字・数字をそれぞれ1文字以上含めてください。
            </p>
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
