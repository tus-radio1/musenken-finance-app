"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, List, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const bottomNavItems = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/ledger", label: "出納帳", icon: List },
  { href: "/members", label: "部員情報", icon: Users },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center justify-around h-14">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-xs transition-colors",
                active
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
