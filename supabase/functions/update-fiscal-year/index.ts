// Edge Function: update-fiscal-year
// Automatically switches the `is_current` flag in the `fiscal_years` table
// so that only the current fiscal year is marked as active.
//
// 会計年度の定義: N年4月〜N+1年3月 を「N年度」とする。
// 境界: 3/31 23:59 JST は前年度、4/1 00:00 JST は当年度。
// computeFiscalYear() は JST の月で判定する (month >= 4 → 当暦年, month <= 3 → 前暦年)。
//
// Schedule: pg_cron により毎年 3/31 15:00 UTC (= 4/1 00:00 JST) に実行。
// 既に対象年度の fiscal_years レコードが存在しない場合はスキップする（安全策）。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Compute the fiscal year from a given Date.
 * April (month >= 4) onward belongs to the current calendar year.
 * January-March (month <= 3) belongs to the previous calendar year.
 */
function computeFiscalYear(now: Date): number {
  const jstTime = new Date(now.getTime() + JST_OFFSET_MS);
  const year = jstTime.getUTCFullYear();
  const month = jstTime.getUTCMonth() + 1; // 1-indexed
  return month >= 4 ? year : year - 1;
}

// Deno.serve のシグネチャで req パラメータが必須だが、この関数では使用しない。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required environment variables",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const fiscalYear = computeFiscalYear(now);

    // Check whether the target fiscal year record exists
    const { data: targetRow, error: selectError } = await supabase
      .from("fiscal_years")
      .select("year, is_current")
      .eq("year", fiscalYear)
      .maybeSingle();

    if (selectError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to query fiscal_years: ${selectError.message}`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!targetRow) {
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          message: `Fiscal year ${fiscalYear} does not exist in fiscal_years table. Skipping.`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Reset all rows to is_current = false
    const { error: resetError } = await supabase
      .from("fiscal_years")
      .update({ is_current: false })
      .neq("is_current", false); // Only update rows that are currently true (avoids unnecessary writes)

    if (resetError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to reset is_current flags: ${resetError.message}`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Set the target fiscal year as current
    const { error: updateError } = await supabase
      .from("fiscal_years")
      .update({ is_current: true })
      .eq("year", fiscalYear);

    if (updateError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to set fiscal year ${fiscalYear} as current: ${updateError.message}`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        fiscal_year: fiscalYear,
        message: `Fiscal year ${fiscalYear} is now marked as current.`,
        executed_at: now.toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
