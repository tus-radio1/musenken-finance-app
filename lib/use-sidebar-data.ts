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
import { buildRoleAccess, parseRoleAssignments } from "@/lib/roles/parse";
import {
  canManageMembers,
  canManageSubsidies,
  canViewBudgetPage,
} from "@/lib/roles/permissions";
import type { RoleAccessContext } from "@/lib/roles/types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
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
  access: RoleAccessContext;
  userProfile: UserProfile | null;
  pendingSubsidies: PendingSubsidy[];
};

const EMPTY_SIDEBAR_DATA: SidebarData = {
  roleNames: [],
  roleTypes: [],
  access: buildRoleAccess([]),
  userProfile: null,
  pendingSubsidies: [],
};

/** Distinct non-empty values, in first-seen order (for display). */
function distinct(values: readonly string[]): string[] {
  return [...new Set(values.filter((v) => v !== ""))];
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

  const roles = parseRoleAssignments(rolesResult.data);

  return {
    roleNames: distinct(roles.map((r) => r.name)),
    roleTypes: distinct(roles.map((r) => r.type)),
    access: buildRoleAccess(roles),
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
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const roleNames = data?.roleNames ?? EMPTY_SIDEBAR_DATA.roleNames;
  const roleTypes = data?.roleTypes ?? EMPTY_SIDEBAR_DATA.roleTypes;
  const access = data?.access ?? EMPTY_SIDEBAR_DATA.access;
  const userProfile = data?.userProfile ?? EMPTY_SIDEBAR_DATA.userProfile;
  const pendingSubsidies =
    data?.pendingSubsidies ?? EMPTY_SIDEBAR_DATA.pendingSubsidies;


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
