/**
 * 支援金管理画面で共有する型定義
 */

export type SubsidyItem = {
  id: string;
  category: string;
  term: number;
  expense_type: string;
  name: string;
  applicant_id: string;
  accounting_group_id?: string;
  requested_amount: number;
  calculated_amount: number;
  actual_expense: number;
  status: string;
  created_at: string;
  applicant_name: string;
  accounting_group_name?: string;
  receipt_date?: string | null;
  receipt_url?: string | null;
  evidence_url?: string | null;
  remarks?: string;
  justification?: string | null;
  usage_period?: string | null;
};

export type SortKey = "created_at" | "requested_amount";
export type SortOrder = "asc" | "desc";

export type EditFormState = {
  category: string;
  term: string;
  accounting_group_id: string;
  expense_type: string;
  name: string;
  applicant_id: string;
  requested_amount: number;
  calculated_amount: number;
  actual_amount: number;
  created_at: string;
  receipt_date: string;
  receipt_url: string;
  remarks: string;
  usage_period: string;
  justification: string;
  evidence_url: string;
};
