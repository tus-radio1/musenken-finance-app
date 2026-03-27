"use client";

import useSWR from "swr";
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
import { createClient } from "@/utils/supabase/client";
import type { UserProfile } from "@/components/user-nav";
import type { LucideIcon } from "lucide-react";
import {
  ROLE_TYPES,
  ROLE_NAMES_JA,
  MANAGE_MEMBER_ROLE_NAMES,
} from "@/lib/roles/constants";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type RoleInfoRow = {
  roles:
    | {
        name?: string | null;
        type?: string | null;
      }
    | Array<{
        name?: string | null;
        type?: string | null;
      }>
    | null;
};

type PendingSubsidy = {
  id: string;
  name: string | null;
  category: string | null;
  requested_amount: number | null;
  status: string | null;
};

type SidebarData = {
  roleNames: string[];
  roleTypes: string[];
  userProfile: UserProfile | null;
  pendingSubsidies: PendingSubsidy[];
};

const EMPTY_SIDEBAR_DATA: SidebarData = {
  roleNames: [],
  roleTypes: [],
  userProfile: null,
  pendingSubsidies: [],
};

function extractRoleInfo(rows: RoleInfoRow[] | null | undefined) {
  const names: string[] = [];
  const types: string[] = [];
  const pushRole = (
    role: { name?: string | null; type?: string | null } | null,
  ) => {
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

async function fetchSidebarData(): Promise<SidebarData> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return EMPTY_SIDEBAR_DATA;
  }

  const profileId = user.id;
  const [rolesResult, profileResult, pendingResult] = await Promise.all([
    supabase
      .from("user_roles")
      .select("roles(name, type)")
      .eq("user_id", profileId),
    supabase.from("profiles").select("name").eq("id", profileId).maybeSingle(),
    supabase
      .from("subsidy_items")
      .select("id, name, category, requested_amount, status")
      .eq("applicant_id", profileId)
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (rolesResult.error) {
    throw rolesResult.error;
  }

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (pendingResult.error) {
    throw pendingResult.error;
  }

  const info = extractRoleInfo(
    rolesResult.data as RoleInfoRow[] | null | undefined,
  );

  return {
    roleNames: info.names,
    roleTypes: info.types,
    pendingSubsidies: pendingResult.data ?? [],
    userProfile: {
      full_name: profileResult.data?.name || user.user_metadata?.name || "",
      email: null,
      role: null,
    },
  };
}

export function useSidebarData() {
  const pathname = usePathname();
  const { data, isLoading } = useSWR("sidebar-data", fetchSidebarData, {
    fallbackData: EMPTY_SIDEBAR_DATA,
  });

  const roleNames = data?.roleNames ?? EMPTY_SIDEBAR_DATA.roleNames;
  const roleTypes = data?.roleTypes ?? EMPTY_SIDEBAR_DATA.roleTypes;
  const userProfile = data?.userProfile ?? EMPTY_SIDEBAR_DATA.userProfile;
  const pendingSubsidies =
    data?.pendingSubsidies ?? EMPTY_SIDEBAR_DATA.pendingSubsidies;

  // 会計ロールを持つユーザーのみが見られるナビゲーション項目
  const hasAccountingRole = roleNames.includes(ROLE_NAMES_JA.ACCOUNTING);
  // 部長・副部長・会計・Admin ロールを持つユーザーのみ部員管理を表示
  const hasManageRole =
    roleNames.some((n: string) =>
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
    isLoadingRoles: isLoading,
    pendingSubsidies,
    navItems,
  };
}
