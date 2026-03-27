"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useSidebarDataContext } from "@/components/sidebar-data-provider";
import { UserNav } from "@/components/user-nav";

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const {
    pathname,
    roleNames,
    userProfile,
    isLoadingRoles,
    pendingSubsidies,
    navItems,
  } = useSidebarDataContext();

  // --- スワイプ検出 ---
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = Math.abs(touch.clientY - touchStartY.current);

      // 左端30px以内から右に80px以上スワイプ（縦方向の移動が横方向より小さい場合のみ）
      if (!open && touchStartX.current < 30 && deltaX > 80 && deltaY < deltaX) {
        setOpen(true);
      }

      touchStartX.current = null;
      touchStartY.current = null;
    },
    [open],
  );

  useEffect(() => {
    // md (768px) 未満の場合のみスワイプを有効化
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => {
      if (mq.matches) {
        document.addEventListener("touchstart", handleTouchStart, {
          passive: true,
        });
        document.addEventListener("touchend", handleTouchEnd, {
          passive: true,
        });
      } else {
        document.removeEventListener("touchstart", handleTouchStart);
        document.removeEventListener("touchend", handleTouchEnd);
      }
    };

    update();
    mq.addEventListener("change", update);

    return () => {
      mq.removeEventListener("change", update);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);

  // ページ遷移時にドロワーを閉じる
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* ハンバーガーメニューボタン */}
      <div className="fixed top-3 left-3 z-40 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          className="h-10 w-10 rounded-full bg-background/80 backdrop-blur shadow-sm border text-foreground"
          aria-label="メニューを開く"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* ドロワー */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle className="text-lg font-bold">無線研会計班</SheetTitle>
            <SheetDescription className="sr-only">
              ナビゲーションメニュー
            </SheetDescription>
          </SheetHeader>

          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1 text-sm">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className="block">
                  <Button
                    variant={active ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start gap-2 px-3",
                      active && "font-semibold",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>

          {/* 申請中の支援金一覧 */}
          {pendingSubsidies.length > 0 && (
            <div className="px-3 py-2 border-t">
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                申請中の支援金
              </span>
              <div className="mt-1 space-y-1">
                {pendingSubsidies.map((s: any) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-1 text-xs py-1 px-1 rounded hover:bg-muted/50 transition-colors"
                  >
                    <span className="truncate flex-1" title={s.name}>
                      {s.name}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      ¥{Number(s.requested_amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* フッター: 役職 + ユーザー情報 */}
          <div className="border-t p-4 flex flex-col gap-3 flex-shrink-0">
            {isLoadingRoles ? (
              <span className="text-muted-foreground text-xs">
                役職を取得しています...
              </span>
            ) : roleNames.length > 0 ? (
              <div className="space-y-1">
                <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                  あなたの役職
                </span>
                <div className="flex flex-wrap gap-1 text-xs text-foreground">
                  {roleNames.map((name) => (
                    <span
                      key={name}
                      className="rounded bg-muted px-2 py-0.5 text-muted-foreground"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground text-xs">
                役職は未設定です
              </span>
            )}

            {userProfile && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <UserNav user={userProfile} />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium truncate">
                    {userProfile.full_name}
                  </span>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
