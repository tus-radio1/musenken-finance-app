import { z } from "zod";
import type { Json } from "@/lib/database.types";
import { formatCurrency } from "@/lib/format";

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_TABLE_LABELS = {
  transactions: "取引",
  subsidy_items: "支援金",
  profiles: "部員",
  budgets: "予算",
  accounting_groups: "会計グループ",
  fiscal_years: "会計年度",
  roles: "役職",
  user_roles: "役職割当",
  financial_accounts: "財布",
  system_config: "システム設定",
} as const;
export const AUDIT_ACTION_LABELS = {
  INSERT: "登録", UPDATE: "更新", DELETE: "削除", SOFT_DELETE: "論理削除",
} as const;

const optionalParam = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => value === "" ? undefined : value, schema.optional());

export const auditLogParamsSchema = z.object({
  page: z.preprocess((value) => value === "" ? undefined : value,
    z.coerce.number().int().min(1).max(1_000_000).default(1)),
  table: optionalParam(z.enum(Object.keys(AUDIT_TABLE_LABELS) as [keyof typeof AUDIT_TABLE_LABELS, ...(keyof typeof AUDIT_TABLE_LABELS)[]])),
  action: optionalParam(z.enum(["INSERT", "UPDATE", "DELETE", "SOFT_DELETE"])),
  actor: optionalParam(z.string().uuid()),
  from: optionalParam(z.string().date()),
  to: optionalParam(z.string().date()),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: "開始日は終了日以前にしてください", path: ["to"],
});
export type AuditLogParams = z.infer<typeof auditLogParamsSchema>;

/** Inclusive date filters are interpreted in JST, independent of server timezone. */
export function auditDateBounds(params: Pick<AuditLogParams, "from" | "to">): {
  from?: string; until?: string;
} {
  return {
    from: params.from ? new Date(`${params.from}T00:00:00+09:00`).toISOString() : undefined,
    until: params.to ? new Date(new Date(`${params.to}T00:00:00+09:00`).getTime() + 86_400_000).toISOString() : undefined,
  };
}

export function auditPageHref(params: AuditLogParams, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, page })) {
    if (value !== undefined) query.set(key, String(value));
  }
  return `/audit-logs?${query}`;
}

function asRecord(data: Json | undefined): Record<string, Json | undefined> {
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

/** Sort object keys recursively: JSON object key order is not a change. */
function canonical(value: Json | undefined): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export type AuditFieldChange = { key: string; before: Json | undefined; after: Json | undefined };

export function auditChangedFields(oldData: Json, newData: Json): AuditFieldChange[] {
  const before = asRecord(oldData);
  const after = asRecord(newData);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .filter((key) => canonical(before[key]) !== canonical(after[key]))
    .map((key) => ({ key, before: before[key], after: after[key] }));
}

export function auditValueText(value: Json | undefined): string {
  if (value === undefined) return "（なし）";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function auditRecordSummary(table: string, oldData: Json, newData: Json, recordId: string): string {
  const data = { ...asRecord(oldData), ...asRecord(newData) };
  if (table === "transactions") {
    return [data.date, data.description, typeof data.amount === "number" ? formatCurrency(data.amount) : undefined]
      .filter((value) => value !== undefined && value !== null && value !== "").join(" / ") || recordId;
  }
  return [data.name, data.student_number].filter((value) => typeof value === "string" && value).join(" / ") || recordId;
}

export function formatAuditTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(timestamp));
}
