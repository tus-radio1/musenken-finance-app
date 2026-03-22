import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileQueryError = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message: string;
};

export type MemberProfileRow = {
  id: string;
  name: string;
  student_number: string;
  grade: number | null;
};

function isMissingDeletedAtColumnError(error: ProfileQueryError): boolean {
  const normalized = [error.code, error.details, error.hint, error.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return normalized.includes("profiles.deleted_at") && normalized.includes("does not exist");
}

export async function fetchMemberProfiles(
  supabase: SupabaseClient,
): Promise<MemberProfileRow[]> {
  const select = "id, name, student_number, grade";

  const { data, error } = await supabase
    .from("profiles")
    .select(select)
    .is("deleted_at", null)
    .order("grade", { ascending: false })
    .order("student_number", { ascending: true });

  if (!error) {
    return (data ?? []) as MemberProfileRow[];
  }

  if (!isMissingDeletedAtColumnError(error)) {
    console.error("[fetchMemberProfiles] Failed to fetch profiles:", error);
    return [];
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("profiles")
    .select(select)
    .order("grade", { ascending: false })
    .order("student_number", { ascending: true });

  if (fallbackError) {
    console.error(
      "[fetchMemberProfiles] Fallback fetch without deleted_at failed:",
      fallbackError,
    );
    return [];
  }

  return (fallbackData ?? []) as MemberProfileRow[];
}
