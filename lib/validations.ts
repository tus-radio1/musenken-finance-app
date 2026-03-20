import { z } from "zod";

// --- Common field schemas ---

export const uuidSchema = z.string().uuid("Invalid UUID format");

export const studentNumberSchema = z
  .string()
  .regex(/^\d{7}$/g, "Student number must be 7 digits");

// --- Server action input schemas ---

/** updateTransactionStatus */
export const updateTransactionStatusSchema = z.object({
  transactionId: uuidSchema,
  status: z.enum(["approved", "rejected"]),
  reason: z.string().optional(),
});

/** deleteTransaction */
export const deleteTransactionSchema = z.object({
  id: uuidSchema,
});

/** setGlobalAdmin */
export const setGlobalAdminSchema = z.object({
  userId: uuidSchema,
  enable: z.boolean(),
});

/** assignGroupRole */
export const assignGroupRoleSchema = z.object({
  userId: uuidSchema,
  groupId: uuidSchema,
  roleType: z.enum(["general", "leader"]),
});

/** removeGroupRole */
export const removeGroupRoleSchema = z.object({
  userId: uuidSchema,
  groupId: uuidSchema,
});

/** adminResetPassword */
export const adminResetPasswordSchema = z.object({
  userId: uuidSchema,
});

/** upsertBudget */
export const upsertBudgetSchema = z.object({
  accountingGroupId: uuidSchema,
  amount: z.number().min(0, "Amount must be non-negative"),
  fiscalYear: z.number().int().min(2000).max(2100).optional(),
});

/** createFiscalYearBudgets */
export const createFiscalYearBudgetsSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  budgets: z.array(
    z.object({
      groupId: uuidSchema,
      amount: z.number().min(0),
    }),
  ),
});

/** fetchLedgerTransactions */
export const fetchLedgerTransactionsSchema = z.object({
  accountingGroupId: uuidSchema,
  fyYear: z.number().int().optional(),
});

/** updateUserPassword */
export const updateUserPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain lowercase, uppercase, and digit",
    ),
});

/** updateSubsidyStatus */
export const updateSubsidyStatusSchema = z.object({
  id: uuidSchema,
  status: z.enum([
    "pending",
    "approved",
    "rejected",
    "receipt_submitted",
    "paid",
    "unexecuted",
  ]),
});

/** updateSubsidyItem */
export const updateSubsidyItemSchema = z.object({
  id: uuidSchema,
  updates: z.object({
    category: z.string().optional(),
    term: z.number().int().min(1).max(3).optional(),
    expense_type: z.string().optional(),
    accounting_group_id: uuidSchema.optional(),
    name: z.string().min(1).optional(),
    applicant_id: uuidSchema.optional(),
    requested_amount: z.number().min(0).optional(),
    approved_amount: z.number().min(0).optional(),
    actual_amount: z.number().min(0).optional(),
    created_at: z.string().optional(),
    receipt_date: z.string().nullable().optional(),
    receipt_url: z.string().nullable().optional(),
    remarks: z.string().optional(),
  }),
});

/** deleteSubsidyItem */
export const deleteSubsidyItemSchema = z.object({
  id: uuidSchema,
});

/** updateMySubsidyItem */
export const updateMySubsidyItemSchema = z.object({
  id: uuidSchema,
  values: z.object({
    category: z.string().optional(),
    term: z.number().int().min(1).max(3).optional(),
    expense_type: z.string().optional(),
    income_type: z.string().optional(),
    date: z.date().optional(),
    accounting_group_id: uuidSchema.optional(),
    name: z.string().min(1).optional(),
    requested_amount: z.number().min(1).optional(),
    justification: z.string().optional(),
    receipt_url: z.string().nullable().optional(),
  }),
});

/** addMember */
export const addMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  student_number: studentNumberSchema,
  grade: z.number().int().min(1).max(4),
});

/** updateMember */
export const updateMemberSchema = z.object({
  userId: uuidSchema,
  data: z.object({
    name: z.string().min(1),
    student_number: studentNumberSchema,
    grade: z.number().int().min(0).max(4),
    role_ids: z.array(uuidSchema),
  }),
});

/** retireMember / deleteMember / resetPasswordMember */
export const memberIdSchema = z.object({
  userId: uuidSchema,
});

// --- Utility: Safe validation wrapper ---

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return {
      success: false,
      error: firstError?.message || "Invalid input",
    };
  }
  return { success: true, data: result.data };
}
