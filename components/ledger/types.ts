/**
 * 出納帳コンポーネント群で共有する型定義。
 */

export type { LedgerTransaction, LedgerInitialData } from "@/lib/ledger";

export type Team = { id: string; name: string; type: "general" | "leader" };

export type SortKey =
  | "date"
  | "created_by_name"
  | "description"
  | "amount"
  | "approval_status"
  | "approved_by_name";

export type SortDir = "asc" | "desc" | null;
