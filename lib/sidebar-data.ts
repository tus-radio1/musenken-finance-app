import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRoles } from "@/lib/auth/context";
import { canViewAuditLogs } from "@/lib/roles/permissions";
import type { SidebarData } from "@/lib/sidebar-types";

export const getCurrentProfile = cache(async () => {
  const auth = await getCurrentUser();
  if (!auth) redirect("/login");
  const result = await auth.supabase.from("profiles").select("name")
    .eq("id", auth.profileId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
});

export async function getSidebarData(): Promise<SidebarData> {
  const auth = await getCurrentUser();
  if (!auth) redirect("/login");
  const [access, profile, pending] = await Promise.all([
    getCurrentRoles(),
    getCurrentProfile(),
    auth.supabase.from("subsidy_items")
      .select("id, name, category, requested_amount, status")
      .eq("applicant_id", auth.profileId).eq("status", "pending")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
  ]);
  if (pending.error) throw pending.error;
  const distinct = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
  return {
    roleNames: distinct(access.roles.map((r) => r.name)),
    roleTypes: distinct(access.roles.map((r) => r.type)),
    access,
    showAuditLogs: canViewAuditLogs(access),
    pendingSubsidies: pending.data ?? [],
    userProfile: {
      full_name: profile?.name || auth.user.user_metadata?.name || "",
      email: null,
      role: null,
    },
  };
}
