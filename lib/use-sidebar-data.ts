"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";
import { createClient } from "@/utils/supabase/client";
import type { UserProfile } from "@/components/user-nav";
import type { LucideIcon } from "lucide-react";
import { ROLE_TYPES, ROLE_NAMES_JA, MANAGE_MEMBER_ROLE_NAMES } from "@/lib/roles/constants";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

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

export function useSidebarData() {
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
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5);
          if (active) setPendingSubsidies(pendingSubs || []);

          if (profile) {
            setUserProfile({
              full_name: profile.name || user.user_metadata?.name || "",
              email: null,
              role: null,
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
  const hasAccountingRole = roleNames.includes(ROLE_NAMES_JA.ACCOUNTING);
  // 部長・副部長・会計・Admin ロールを持つユーザーのみ部員管理を表示
  const hasManageRole =
    roleNames.some((n) =>
      (MANAGE_MEMBER_ROLE_NAMES as readonly string[]).includes(n),
    ) || roleTypes.includes(ROLE_TYPES.ADMIN);

  const navItems: NavItem[] = [
    { href: "/", label: "ホーム", icon: Home },
    { href: "/applications", label: "経費申請", icon: FileText },
    { href: "/subsidies", label: "支援金申請", icon: HandCoins },
    { href: "/ledger", label: "出納帳", icon: List },
    { href: "/members", label: "部員情報", icon: Users },
    ...(hasAccountingRole || roleTypes.includes(ROLE_TYPES.ADMIN)
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

  return {
    pathname,
    roleNames,
    roleTypes,
    userProfile,
    isLoadingRoles,
    pendingSubsidies,
    navItems,
  };
}
