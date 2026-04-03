import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/utils/supabase/server";

/**
 * Cached fetch for accounting_groups table.
 * Revalidates every 1 hour (3600s).
 */
export const getAccountingGroups = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("accounting_groups")
      .select("id, name, is_active, type")
      .order("name");

    if (error) {
      console.error("Failed to fetch accounting_groups:", error);
      return [];
    }
    return data ?? [];
  },
  ["accounting_groups"],
  { revalidate: 3600, tags: ["accounting_groups"] },
);

/**
 * Cached fetch for fiscal_years table (ordered by year descending).
 * Revalidates every 5 minutes (300s).
 */
export const getFiscalYears = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("fiscal_years")
      .select("year, is_current")
      .order("year", { ascending: false });

    if (error) {
      console.error("Failed to fetch fiscal_years:", error);
      return [];
    }
    return data ?? [];
  },
  ["fiscal_years"],
  { revalidate: 300, tags: ["fiscal_years"] },
);
