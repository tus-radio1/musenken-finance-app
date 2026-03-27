import { createClient } from "@/utils/supabase/server";
import { extractStudentNumberFromUser } from "@/lib/account";
import { getUserRoleAccess } from "@/lib/roles/access";
import type { RoleAccessContext } from "@/lib/roles/types";
import type {
  AuthContext,
  AuthContextResult,
  SupabaseServerClient,
} from "./types";

export async function resolveAuthContext(options?: {
  supabase?: SupabaseServerClient;
}): Promise<AuthContextResult> {
  const supabase = options?.supabase ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "認証が必要です" };
  }

  const studentNumber = extractStudentNumberFromUser(user);

  return {
    ok: true,
    context: {
      supabase,
      user,
      userId: user.id,
      profileId: user.id,
      studentNumber,
    },
  };
}

export type AuthWithRolesResult =
  | { ok: true; context: AuthContext; access: RoleAccessContext }
  | { ok: false; error: "認証が必要です" };

export async function resolveAuthWithRoles(options?: {
  supabase?: SupabaseServerClient;
}): Promise<AuthWithRolesResult> {
  const authResult = await resolveAuthContext(options);
  if (!authResult.ok) return authResult;
  const access = await getUserRoleAccess(authResult.context);
  return { ok: true, context: authResult.context, access };
}
