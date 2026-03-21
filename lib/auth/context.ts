import { createClient } from "@/utils/supabase/server";
import { extractStudentNumberFromUser } from "@/lib/account";
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
