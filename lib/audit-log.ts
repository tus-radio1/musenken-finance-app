import { createClient } from "@/utils/supabase/server";

interface AuditEventParams {
  tableName: string;
  recordId: string;
  action: "INSERT" | "UPDATE" | "DELETE" | "SOFT_DELETE";
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  changedBy: string;
}

export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("audit_logs").insert({
      table_name: params.tableName,
      record_id: params.recordId,
      action: params.action,
      old_data: params.oldData ?? null,
      new_data: params.newData ?? null,
      changed_by: params.changedBy,
    });
    if (error) {
      // Don't throw on audit failure - log to console but don't break the main operation
      console.error("Audit log insert failed:", error);
    }
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}
