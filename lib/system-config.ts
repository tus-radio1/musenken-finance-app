import { createClient } from "@/utils/supabase/server";

const ACCOUNTING_USER_ID_FALLBACK =
  "9701edd2-bd9d-4d57-9dd6-7235686103bf";

/**
 * Get accounting system user ID from environment variable.
 * Falls back to hardcoded value for backward compatibility.
 * Use in server components and server actions.
 */
export function getAccountingUserIdSync(): string {
  return (
    process.env.ACCOUNTING_SYSTEM_USER_ID ?? ACCOUNTING_USER_ID_FALLBACK
  );
}

/**
 * Get accounting system user ID from DB system_config table.
 * Falls back to env var, then hardcoded value.
 * Use when you want the most up-to-date value from DB.
 */
export async function getAccountingUserId(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "accounting_user_id")
      .single();
    return data?.value ?? getAccountingUserIdSync();
  } catch {
    return getAccountingUserIdSync();
  }
}
