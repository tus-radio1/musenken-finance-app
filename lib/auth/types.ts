import type { User, SupabaseClient } from "@supabase/supabase-js";

export type SupabaseServerClient = SupabaseClient;

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
