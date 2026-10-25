"use client";

import { usePathname } from "next/navigation";
import {
  Home,
  FileText,
  PieChart,
  Settings,
  List,
  Users,
  UserCog,
  HandCoins,
  History,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  canManageMembers,
  canManageSubsidies,
  canViewBudgetPage,
} from "@/lib/roles/permissions";
import type { SidebarData } from "@/lib/sidebar-types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function useSidebarData(data: SidebarData) {
  const pathname = usePathname();
  const { roleNames, roleTypes, access, userProfile, pendingSubsidies } = data;

  const navItems: NavItem[] = [
    { href: "/", label: "ホーム", icon: Home },
    { href: "/applications", label: "経費申請", icon: FileText },
    { href: "/subsidies", label: "支援金申請", icon: HandCoins },
    { href: "/ledger", label: "出納帳", icon: List },
    { href: "/members", label: "部員情報", icon: Users },
    // 表示判定はページ・Server Action と同じ lib/roles/permissions の関数
    ...(canViewBudgetPage(access)
      ? [{ href: "/budget", label: "予算管理", icon: PieChart }]
      : []),
    ...(canManageSubsidies(access)
      ? [{ href: "/subsidies/manage", label: "支援金管理", icon: HandCoins }]
      : []),
    ...(canManageMembers(access)
      ? [{ href: "/members/manage", label: "部員管理", icon: UserCog }]
      : []),
    ...(data.showAuditLogs
      ? [{ href: "/audit-logs", label: "変更履歴", icon: History }]
      : []),
    { href: "/settings", label: "設定", icon: Settings },
  ];

  return {
    pathname,
    roleNames,
    roleTypes,
    userProfile,
    isLoadingRoles: false,
    pendingSubsidies,
    navItems,
  };
}
