import { createClient } from "@/utils/supabase/server";
import type { Json } from "@/lib/database.types";

interface AuditEventParams {
  tableName: string;
  recordId: string;
  action: "INSERT" | "UPDATE" | "DELETE" | "SOFT_DELETE";
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  changedBy: string;
}

/**
 * Insert an audit row and report whether it was stored. Use this when the
 * caller must not proceed without an audit record (fail closed).
 */
export async function recordAuditEvent(
  params: AuditEventParams,
): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("audit_logs").insert({
      table_name: params.tableName,
      record_id: params.recordId,
      action: params.action,
      old_data: (params.oldData as Json) ?? null,
      new_data: (params.newData as Json) ?? null,
      changed_by: params.changedBy,
    });
    if (error) {
      console.error("Audit log insert failed:", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    console.error("Audit log failed:", error);
    return { ok: false };
  }
}

/** Best-effort audit: failures are logged but never break the main operation. */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  await recordAuditEvent(params);
}
