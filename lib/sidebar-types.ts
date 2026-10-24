import type { UserProfile } from "@/components/user-nav";
import type { RoleAccessContext } from "@/lib/roles/types";

type PendingSubsidy = {
  id: string;
  name: string | null;
  category: string | null;
  requested_amount: number | null;
  status: string | null;
};

export type SidebarData = {
  roleNames: string[];
  roleTypes: string[];
  access: RoleAccessContext;
  userProfile: UserProfile | null;
  pendingSubsidies: PendingSubsidy[];
};

