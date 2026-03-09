"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FileText,
  Bell,
  PieChart,
  Settings,
  List,
  Users,
  UserCog,
  HandCoins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";
import { createClient } from "@/utils/supabase/client";
import { UserNav, UserProfile } from "@/components/user-nav";
import { Badge } from "@/components/ui/badge";

function extractRoleInfo(rows: any[] | null | undefined) {
  const names: string[] = [];
  const types: string[] = [];
  const pushRole = (role: any) => {
    const name = role?.name;
    const type = role?.type;
    if (name && !names.includes(name)) names.push(name);
    if (type && !types.includes(type)) types.push(type);
  };
  (rows || []).forEach((row) => {
    const roles = row?.roles;
    if (Array.isArray(roles)) roles.forEach(pushRole);
    else pushRole(roles);
  });
  return { names, types };
}

export function AppSidebar() {
  const pathname = usePathname();
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [roleTypes, setRoleTypes] = useState<string[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [pendingSubsidies, setPendingSubsidies] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const loadRoles = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (active) setRoleNames([]);
          return;
        }

        const studentNumber = extractStudentNumberFromUser(user);
        const profileId = await findProfileIdByStudentNumber(
          supabase,
          studentNumber,
        );
        if (!profileId) {
          if (active) setRoleNames([]);
          return;
        }

        const { data: rows, error } = await supabase
          .from("user_roles")
          .select("roles(name, type)")
          .eq("user_id", profileId);

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", profileId)
          .maybeSingle();

        if (error) throw error;

        if (active) {
          const info = extractRoleInfo(rows);
          setRoleNames(info.names);
          setRoleTypes(info.types);

          // 申請中の支援金を取得
          const { data: pendingSubs } = await supabase
            .from("subsidy_items")
            .select("id, name, category, requested_amount, status")
            .eq("applicant_id", profileId)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(5);
          if (active) setPendingSubsidies(pendingSubs || []);

          if (profile) {
            setUserProfile({
              full_name: profile.full_name,
              email: user.email || "",
              role: profile.role,
            });
          }
        }
      } catch (error) {
        if (active) {
          setRoleNames([]);
          setRoleTypes([]);
        }
      } finally {
        if (active) setIsLoadingRoles(false);
      }
    };

    loadRoles();

    return () => {
      active = false;
    };
  }, []);

  // 会計ロールを持つユーザーのみが見られるナビゲーション項目
  const hasAccountingRole = roleNames.includes("会計");
  // 部長・副部長・会計・Admin ロールを持つユーザーのみ部員管理を表示
  const hasManageRole =
    roleNames.some((n) => ["部長", "副部長", "会計"].includes(n)) ||
    roleTypes.includes("admin");

  const navItems = [
    { href: "/", label: "ホーム", icon: Home },
    { href: "/applications", label: "経費申請", icon: FileText },
    { href: "/subsidies", label: "支援金申請", icon: HandCoins },
    { href: "/ledger", label: "出納帳", icon: List },
    { href: "/members", label: "部員情報", icon: Users },
    { href: "/notifications", label: "通知", icon: Bell },
    ...(hasAccountingRole || roleTypes.includes("admin")
      ? [
          { href: "/budget", label: "予算管理", icon: PieChart },
          { href: "/subsidies/manage", label: "支援金管理", icon: HandCoins },
        ]
      : []),
    ...(hasManageRole
      ? [{ href: "/members/manage", label: "部員管理", icon: UserCog }]
      : []),
    { href: "/settings", label: "設定", icon: Settings },
  ];

  return (
    <aside className="hidden md:flex md:flex-col md:w-56 border-r bg-white">
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
              <span className="text-xs text-muted-foreground truncate">
                {userProfile.email}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
