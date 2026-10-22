import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type SupabaseServerClient = SupabaseClient<Database>;

export type AuthContext = {
  supabase: SupabaseServerClient;
  user: User;
  userId: string;
  profileId: string;
  studentNumber: string | null;
};

export type AuthContextResult =
  | { ok: true; context: AuthContext }
  | { ok: false; error: "認証が必要です" };
