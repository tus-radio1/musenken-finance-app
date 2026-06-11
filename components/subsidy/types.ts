/**
 * 支援金申請テーブル・カードで共有する型定義
 */

export type SubsidyItem = {
  id: string;
  category: string;
  term: number;
  expense_type: string;
  name: string;
  income_type?: string;
  requested_amount: number;
  approved_amount: number | null;
  status: string;
  accounting_group_id?: string;
  accounting_group_name: string;
  created_at: string;
  date?: string | null;
  usage_period?: string | null;
  justification?: string | null;
  receipt_url?: string | null;
  receipt_public_url?: string | null;
  evidence_url?: string | null;
  evidence_public_url?: string | null;
  remarks?: string | null;
};

export type SortKey = "created_at" | "requested_amount";
export type SortOrder = "asc" | "desc";

export type EditFormState = {
  category: string;
  term: string;
  accounting_group_id: string;
  expense_type: string;
  name: string;
  requested_amount: number;
  usage_period: string;
  income_type: string;
  date: Date | undefined;
  justification: string;
  remarks: string;
};
