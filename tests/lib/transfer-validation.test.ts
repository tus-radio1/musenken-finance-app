import { describe, it, expect } from "vitest";
import { createTransferSchema } from "@/lib/validations";
import { transferFormSchema } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Server-side createTransferSchema
// ---------------------------------------------------------------------------

describe("createTransferSchema", () => {
  const validInput = {
    date: "2026-06-12",
    amount: 10000,
    fromAccountId: "550e8400-e29b-41d4-a716-446655440000",
    toAccountId: "550e8400-e29b-41d4-a716-446655440001",
    description: "銀行口座から金庫へ移動",
  };

  it("accepts valid input", () => {
    const result = createTransferSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects zero amount", () => {
    const result = createTransferSchema.safeParse({
      ...validInput,
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = createTransferSchema.safeParse({
      ...validInput,
      amount: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects same source and destination", () => {
    const result = createTransferSchema.safeParse({
      ...validInput,
      toAccountId: validInput.fromAccountId,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = createTransferSchema.safeParse({
      ...validInput,
      description: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for fromAccountId", () => {
    const result = createTransferSchema.safeParse({
      ...validInput,
      fromAccountId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional receiptUrl and remarks", () => {
    const result = createTransferSchema.safeParse({
      ...validInput,
      receiptUrl: "path/to/receipt.webp",
      remarks: "Some notes",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null receiptUrl and remarks", () => {
    const result = createTransferSchema.safeParse({
      ...validInput,
      receiptUrl: null,
      remarks: null,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Client-side transferFormSchema
// ---------------------------------------------------------------------------

describe("transferFormSchema", () => {
  const validInput = {
    date: new Date("2026-06-12"),
    amount: 5000,
    from_account_id: "550e8400-e29b-41d4-a716-446655440000",
    to_account_id: "550e8400-e29b-41d4-a716-446655440001",
    description: "金庫から銀行口座へ入金",
  };

  it("accepts valid input", () => {
    const result = transferFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects same from and to accounts", () => {
    const result = transferFormSchema.safeParse({
      ...validInput,
      to_account_id: validInput.from_account_id,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const toAccountError = result.error.errors.find(
        (e) => e.path.includes("to_account_id"),
      );
      expect(toAccountError).toBeDefined();
    }
  });

  it("rejects zero amount", () => {
    const result = transferFormSchema.safeParse({
      ...validInput,
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = transferFormSchema.safeParse({
      ...validInput,
      description: "",
    });
    expect(result.success).toBe(false);
  });
});
