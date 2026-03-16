"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserNav } from "@/components/user-nav";
import { useSidebarData } from "@/lib/use-sidebar-data";

export function AppSidebar() {
  const {
    pathname,
    roleNames,
    userProfile,
    isLoadingRoles,
    pendingSubsidies,
    navItems,
  } = useSidebarData();

  return (
    <aside className="hidden md:flex md:flex-col md:w-56 border-r bg-background">
      <div className="h-16 flex items-center px-4 border-b font-bold text-lg">
        無線研会計班
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1 text-sm">
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
      <div className="border-t p-4 flex flex-col gap-4 min-h-0 flex-shrink-0">
        <div className="flex-1 overflow-y-auto pr-2 max-h-48 space-y-2">
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
        </div>

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
    </aside>
  );
}
