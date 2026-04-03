import "server-only";

import { unstable_cache } from "next/cache";
import { ACCOUNTING_USER_ID_FALLBACK } from "@/lib/system-config.shared";
import { createAdminClient } from "@/utils/supabase/server";

export { ACCOUNTING_USER_ID_FALLBACK } from "@/lib/system-config.shared";

/**
 * Get accounting system user ID from environment variable.
 * Falls back to hardcoded value for backward compatibility.
 * Use in server components and server actions.
 */
export function getAccountingUserIdSync(): string {
  return process.env.ACCOUNTING_SYSTEM_USER_ID ?? ACCOUNTING_USER_ID_FALLBACK;
}

/**
 * Get accounting system user ID from DB system_config table.
 * Cached with unstable_cache (revalidate: 3600s).
 * Falls back to env var, then hardcoded value.
 */
export const getAccountingUserId = unstable_cache(
  async (): Promise<string> => {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "accounting_user_id")
        .single();
      return data?.value ?? getAccountingUserIdSync();
    } catch {
      return getAccountingUserIdSync();
    }
  },
  ["system_config_accounting_user_id"],
  { revalidate: 3600, tags: ["system_config"] },
);
