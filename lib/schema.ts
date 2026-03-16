import { z } from "zod";

export const formSchema = z.object({
  date: z.date({
    required_error: "日付を選択してください",
  }),
  amount: z.coerce.number().min(1, "金額は1円以上で入力してください"),
  type: z.enum(["expense", "income"], {
    required_error: "収支の種類を選択してください",
  }),
  accounting_group_id: z.string({
    required_error: "会計グループを選択してください",
  }),
  description: z.string().min(1, "摘要を入力してください"),
  // 領収書URL（任意）
  receipt_url: z.string().nullable().optional(),
  // 備考（任意）
  remarks: z.string().nullable().optional(),
  // Admin用: 申請者 (作成者) の変更
  created_by: z.string().optional(),
  // Admin用: 承認者 の変更
  approved_by: z.string().nullable().optional(),
  // Admin/Accounting用: 承認ステータス
  approval_status: z
    .enum([
      "pending",
      "accepted",
      "approved",
      "rejected",
      "receipt_received",
      "refunded",
      "received",
    ])
    .optional(),
});

export const subsidyFormSchema = z.object({
  category: z.enum(["activity", "league", "special"], {
    required_error: "支援金種別を選択してください",
  }),
  term: z.coerce.number().min(1).max(3),
  expense_type: z.enum(
    [
      "facility",
      "participation",
      "equipment",
      "registration",
      "travel",
      "accommodation",
      "other",
      "tournament",
      "expensive_goods",
    ],
    { required_error: "経費種別を選択してください" },
  ),
  income_type: z.enum(["expense", "income"], {
    required_error: "収支区分を選択してください",
  }),
  date: z.date({
    required_error: "日付を選択してください",
  }),
  accounting_group_id: z.string({
    required_error: "会計グループを選択してください",
  }),
  name: z.string().min(1, "項目名を入力してください"),
  requested_amount: z.coerce.number().min(1, "金額は1円以上で入力してください"),
  justification: z.string({
    required_error: "申請理由を入力してください",
  }).min(1, "申請理由を入力してください"),
  evidence_url: z.string({
    required_error: "根拠書類をアップロードしてください",
  }).min(1, "根拠書類をアップロードしてください"),
});
