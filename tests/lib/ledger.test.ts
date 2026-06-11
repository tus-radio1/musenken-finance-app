import { describe, it, expect } from "vitest";
import {
  calculateIncomeTotal,
  calculateExpenseTotal,
  calculateLedgerTotals,
  synthesizeLedgerRows,
  type TransactionRow,
  type SubsidyItemData,
} from "@/lib/ledger";

// ---------------------------------------------------------------------------
// calculateIncomeTotal
// ---------------------------------------------------------------------------

describe("calculateIncomeTotal", () => {
  it("sums positive amounts as income", () => {
    const rows = [{ amount: 1000 }, { amount: 2000 }, { amount: -500 }];
    expect(calculateIncomeTotal(rows)).toBe(3000);
  });

  it("returns 0 for empty array", () => {
    expect(calculateIncomeTotal([])).toBe(0);
  });

  it("treats zero as income", () => {
    const rows = [{ amount: 0 }, { amount: 100 }];
    expect(calculateIncomeTotal(rows)).toBe(100);
  });

  it("excludes transfers when excludeTransfers is true", () => {
    const rows = [
      { amount: 1000, transaction_kind: "income" },
      { amount: 500, transaction_kind: "transfer" },
    ];
    expect(calculateIncomeTotal(rows, { excludeTransfers: true })).toBe(1000);
  });

  it("filters by financialAccountId", () => {
    const rows = [
      { amount: 1000, financial_account_id: "a" },
      { amount: 2000, financial_account_id: "b" },
    ];
    expect(calculateIncomeTotal(rows, { financialAccountId: "a" })).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// calculateExpenseTotal
// ---------------------------------------------------------------------------

describe("calculateExpenseTotal", () => {
  it("sums absolute values of negative amounts", () => {
    const rows = [{ amount: -300 }, { amount: -700 }, { amount: 1000 }];
    expect(calculateExpenseTotal(rows)).toBe(1000);
  });

  it("returns 0 when no expenses", () => {
    const rows = [{ amount: 500 }];
    expect(calculateExpenseTotal(rows)).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(calculateExpenseTotal([])).toBe(0);
  });

  it("excludes transfers when excludeTransfers is true", () => {
    const rows = [
      { amount: -500, transaction_kind: "expense" },
      { amount: -300, transaction_kind: "transfer" },
    ];
    expect(calculateExpenseTotal(rows, { excludeTransfers: true })).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// calculateLedgerTotals
// ---------------------------------------------------------------------------

describe("calculateLedgerTotals", () => {
  it("computes income, expense, and budgetRemaining correctly", () => {
    const rows = [{ amount: 5000 }, { amount: -2000 }, { amount: -1000 }];
    const result = calculateLedgerTotals(rows, 10000, 500);
    expect(result.income).toBe(5000);
    expect(result.expense).toBe(3000);
    // budgetRemaining = budget + carryover + income - expense = 10000 + 500 + 5000 - 3000
    expect(result.budgetRemaining).toBe(12500);
  });

  it("handles zero budget and carryover", () => {
    const rows = [{ amount: 100 }, { amount: -50 }];
    const result = calculateLedgerTotals(rows, 0, 0);
    expect(result.income).toBe(100);
    expect(result.expense).toBe(50);
    expect(result.budgetRemaining).toBe(50);
  });

  it("handles empty rows", () => {
    const result = calculateLedgerTotals([], 5000, 1000);
    expect(result.income).toBe(0);
    expect(result.expense).toBe(0);
    expect(result.budgetRemaining).toBe(6000);
  });

  it("shows negative budgetRemaining when overspent", () => {
    const rows = [{ amount: -8000 }];
    const result = calculateLedgerTotals(rows, 5000, 0);
    expect(result.budgetRemaining).toBe(-3000);
  });
});

// ---------------------------------------------------------------------------
// synthesizeLedgerRows
// ---------------------------------------------------------------------------

describe("synthesizeLedgerRows", () => {
  const baseTx: TransactionRow = {
    id: "tx-1",
    date: "2025-04-01",
    amount: -1000,
    description: "test",
    accounting_group_id: "grp-1",
    approval_status: "approved",
    receipt_url: null,
    created_by: "user-1",
    approved_by: null,
    rejected_reason: null,
    remarks: null,
  };

  it("returns transactions as-is when no subsidies", () => {
    const result = synthesizeLedgerRows([baseTx], [], "grp-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("tx-1");
  });

  it("generates expense and income rows for subsidy items", () => {
    const subsidy: SubsidyItemData = {
      id: "sub-1",
      name: "Test subsidy",
      requested_amount: 2000,
      approved_amount: 1500,
      actual_amount: 1200,
      created_at: "2025-04-05",
      applicant_id: "user-2",
      receipt_date: "2025-04-10",
      status: "approved",
    };

    const result = synthesizeLedgerRows([], [subsidy], "grp-1");
    expect(result).toHaveLength(2);

    const expenseRow = result.find((r) => r.id === "subsidy-expense-sub-1");
    expect(expenseRow).toBeDefined();
    expect(expenseRow!.amount).toBe(-1200);
    expect(expenseRow!.is_subsidy).toBe(true);

    const incomeRow = result.find((r) => r.id === "subsidy-income-sub-1");
    expect(incomeRow).toBeDefined();
    expect(incomeRow!.amount).toBe(1500);
    expect(incomeRow!.is_subsidy).toBe(true);
  });

  it("excludes transactions linked to processed subsidy items", () => {
    const linkedTx: TransactionRow = {
      ...baseTx,
      id: "tx-linked",
      subsidy_item_id: "sub-1",
    };

    const subsidy: SubsidyItemData = {
      id: "sub-1",
      name: "Linked subsidy",
      requested_amount: 1000,
      approved_amount: 800,
      actual_amount: 700,
      created_at: "2025-04-01",
      applicant_id: "user-1",
      receipt_date: null,
      status: "paid",
    };

    const result = synthesizeLedgerRows([linkedTx], [subsidy], "grp-1");
    // The linked transaction should be excluded, replaced by subsidy virtual rows
    const linkedFound = result.find((r) => r.id === "tx-linked");
    expect(linkedFound).toBeUndefined();
    // But subsidy rows should exist
    expect(result.some((r) => r.id.startsWith("subsidy-"))).toBe(true);
  });

  it("sorts rows by date descending", () => {
    const tx1: TransactionRow = { ...baseTx, id: "old", date: "2025-01-01" };
    const tx2: TransactionRow = { ...baseTx, id: "new", date: "2025-06-01" };
    const result = synthesizeLedgerRows([tx1, tx2], []);
    expect(result[0].id).toBe("new");
    expect(result[1].id).toBe("old");
  });
});
