import { describe, it, expect } from "vitest";
import {
  uuidSchema,
  studentNumberSchema,
  updateTransactionStatusSchema,
  deleteTransactionSchema,
  updateUserPasswordSchema,
  upsertBudgetSchema,
  addMemberSchema,
  createAccountingGroupSchema,
  validateInput,
} from "@/lib/validations";

// ---------------------------------------------------------------------------
// uuidSchema
// ---------------------------------------------------------------------------

describe("uuidSchema", () => {
  it("accepts a valid UUID v4", () => {
    const result = uuidSchema.safeParse("550e8400-e29b-41d4-a716-446655440000");
    expect(result.success).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = uuidSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID string", () => {
    const result = uuidSchema.safeParse("not-a-uuid");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// studentNumberSchema
// ---------------------------------------------------------------------------

describe("studentNumberSchema", () => {
  it("accepts a 7-digit string", () => {
    const result = studentNumberSchema.safeParse("1234567");
    expect(result.success).toBe(true);
  });

  it("rejects a 6-digit string", () => {
    const result = studentNumberSchema.safeParse("123456");
    expect(result.success).toBe(false);
  });

  it("rejects an 8-digit string", () => {
    const result = studentNumberSchema.safeParse("12345678");
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric characters", () => {
    const result = studentNumberSchema.safeParse("123456a");
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = studentNumberSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateTransactionStatusSchema
// ---------------------------------------------------------------------------

describe("updateTransactionStatusSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid approved status", () => {
    const result = updateTransactionStatusSchema.safeParse({
      transactionId: validUUID,
      status: "approved",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid rejected status with reason", () => {
    const result = updateTransactionStatusSchema.safeParse({
      transactionId: validUUID,
      status: "rejected",
      reason: "Insufficient documentation",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = updateTransactionStatusSchema.safeParse({
      transactionId: validUUID,
      status: "pending",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid transaction ID", () => {
    const result = updateTransactionStatusSchema.safeParse({
      transactionId: "not-uuid",
      status: "approved",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteTransactionSchema
// ---------------------------------------------------------------------------

describe("deleteTransactionSchema", () => {
  it("accepts a valid UUID id", () => {
    const result = deleteTransactionSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID id", () => {
    const result = deleteTransactionSchema.safeParse({ id: "abc" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateUserPasswordSchema
// ---------------------------------------------------------------------------

describe("updateUserPasswordSchema", () => {
  it("accepts a valid password with lowercase, uppercase, and digit (8+ chars)", () => {
    const result = updateUserPasswordSchema.safeParse({
      password: "Abcdefg1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = updateUserPasswordSchema.safeParse({
      password: "Abcde1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without uppercase letter", () => {
    const result = updateUserPasswordSchema.safeParse({
      password: "abcdefg1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without lowercase letter", () => {
    const result = updateUserPasswordSchema.safeParse({
      password: "ABCDEFG1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without digit", () => {
    const result = updateUserPasswordSchema.safeParse({
      password: "Abcdefgh",
    });
    expect(result.success).toBe(false);
  });

  it("accepts long password meeting all criteria", () => {
    const result = updateUserPasswordSchema.safeParse({
      password: "SuperSecure123!@#",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// upsertBudgetSchema
// ---------------------------------------------------------------------------

describe("upsertBudgetSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid budget with required fields", () => {
    const result = upsertBudgetSchema.safeParse({
      accountingGroupId: validUUID,
      amount: 100000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero amount", () => {
    const result = upsertBudgetSchema.safeParse({
      accountingGroupId: validUUID,
      amount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative amount", () => {
    const result = upsertBudgetSchema.safeParse({
      accountingGroupId: validUUID,
      amount: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional carryover and fiscal year", () => {
    const result = upsertBudgetSchema.safeParse({
      accountingGroupId: validUUID,
      amount: 50000,
      carryoverAmount: 10000,
      fiscalYear: 2025,
    });
    expect(result.success).toBe(true);
  });

  it("rejects fiscal year below 2000", () => {
    const result = upsertBudgetSchema.safeParse({
      accountingGroupId: validUUID,
      amount: 50000,
      fiscalYear: 1999,
    });
    expect(result.success).toBe(false);
  });

  it("rejects fiscal year above 2100", () => {
    const result = upsertBudgetSchema.safeParse({
      accountingGroupId: validUUID,
      amount: 50000,
      fiscalYear: 2101,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addMemberSchema
// ---------------------------------------------------------------------------

describe("addMemberSchema", () => {
  it("accepts valid member data", () => {
    const result = addMemberSchema.safeParse({
      name: "Test User",
      student_number: "1234567",
      grade: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = addMemberSchema.safeParse({
      name: "",
      student_number: "1234567",
      grade: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects grade below 1", () => {
    const result = addMemberSchema.safeParse({
      name: "Test",
      student_number: "1234567",
      grade: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects grade above 4", () => {
    const result = addMemberSchema.safeParse({
      name: "Test",
      student_number: "1234567",
      grade: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid student number", () => {
    const result = addMemberSchema.safeParse({
      name: "Test",
      student_number: "123",
      grade: 1,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createAccountingGroupSchema
// ---------------------------------------------------------------------------

describe("createAccountingGroupSchema", () => {
  it("accepts valid group data", () => {
    const result = createAccountingGroupSchema.safeParse({
      name: "New Group",
      type: "general",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createAccountingGroupSchema.safeParse({
      name: "",
      type: "general",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 100 characters", () => {
    const result = createAccountingGroupSchema.safeParse({
      name: "a".repeat(101),
      type: "general",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty type", () => {
    const result = createAccountingGroupSchema.safeParse({
      name: "Group",
      type: "",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateInput utility
// ---------------------------------------------------------------------------

describe("validateInput", () => {
  it("returns success with data for valid input", () => {
    const result = validateInput(uuidSchema, "550e8400-e29b-41d4-a716-446655440000");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
  });

  it("returns error message for invalid input", () => {
    const result = validateInput(uuidSchema, "bad");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  it("returns first error message when multiple validations fail", () => {
    const result = validateInput(addMemberSchema, {
      name: "",
      student_number: "bad",
      grade: 99,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe("string");
    }
  });
});
