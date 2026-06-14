import { describe, it, expect } from "vitest";
import {
  calculateIncomeTotal,
  calculateExpenseTotal,
  calculateClubLedgerSummary,
  type FinancialAccountInfo,
} from "@/lib/ledger";
import {
  canViewClubLedger,
  canCreateClubTransaction,
  canManageFinancialAccounts,
} from "@/lib/auth/permissions";
import type { RoleAccessContext } from "@/lib/roles/types";

// ---------------------------------------------------------------------------
// calculateClubLedgerSummary
// ---------------------------------------------------------------------------

describe("calculateClubLedgerSummary", () => {
  const accounts: FinancialAccountInfo[] = [
    { id: "cash", name: "金庫" },
    { id: "bank", name: "銀行口座" },
  ];

  it("computes income and expense excluding transfers", () => {
    const rows = [
      { amount: 5000, transaction_kind: "income", financial_account_id: "cash", approval_status: "approved" },
      { amount: -2000, transaction_kind: "expense", financial_account_id: "cash", approval_status: "approved" },
      { amount: 3000, transaction_kind: "transfer", financial_account_id: "cash", approval_status: "approved" },
      { amount: -3000, transaction_kind: "transfer", financial_account_id: "bank", approval_status: "approved" },
    ];

    const result = calculateClubLedgerSummary(rows, rows, accounts);
    expect(result.income).toBe(5000);
    expect(result.expense).toBe(2000);
    expect(result.balance).toBe(3000);
  });

  it("excludes pending and rejected rows from income/expense", () => {
    const rows = [
      { amount: 1000, transaction_kind: "income", financial_account_id: "cash", approval_status: "approved" },
      { amount: 2000, transaction_kind: "income", financial_account_id: "cash", approval_status: "pending" },
      { amount: -500, transaction_kind: "expense", financial_account_id: "cash", approval_status: "rejected" },
    ];

    const result = calculateClubLedgerSummary(rows, rows, accounts);
    expect(result.income).toBe(1000);
    expect(result.expense).toBe(0);
  });

  it("calculates wallet balances across all approved transactions", () => {
    const rows = [
      { amount: 10000, transaction_kind: "income", financial_account_id: "cash", approval_status: "approved" },
      { amount: -3000, transaction_kind: "expense", financial_account_id: "cash", approval_status: "approved" },
      { amount: 5000, transaction_kind: "income", financial_account_id: "bank", approval_status: "approved" },
      { amount: -2000, transaction_kind: "transfer", financial_account_id: "bank", approval_status: "approved" },
      { amount: 2000, transaction_kind: "transfer", financial_account_id: "cash", approval_status: "approved" },
    ];

    const result = calculateClubLedgerSummary(rows, rows, accounts);
    // cash: 10000 - 3000 + 2000 = 9000
    expect(result.walletBalances["cash"]).toBe(9000);
    // bank: 5000 - 2000 = 3000
    expect(result.walletBalances["bank"]).toBe(3000);
  });

  it("transfer does not affect total balance", () => {
    const rows = [
      { amount: 10000, transaction_kind: "income", financial_account_id: "cash", approval_status: "approved" },
      { amount: -5000, transaction_kind: "transfer", financial_account_id: "cash", approval_status: "approved" },
      { amount: 5000, transaction_kind: "transfer", financial_account_id: "bank", approval_status: "approved" },
    ];

    const result = calculateClubLedgerSummary(rows, rows, accounts);
    const totalBalance = Object.values(result.walletBalances).reduce((s, v) => s + v, 0);
    // Total should be 10000 (income) - transfers cancel out
    expect(totalBalance).toBe(10000);
  });

  it("calculates transfer total from positive approved transfer amounts", () => {
    const rows = [
      { amount: 3000, transaction_kind: "transfer", financial_account_id: "cash", approval_status: "approved" },
      { amount: -3000, transaction_kind: "transfer", financial_account_id: "bank", approval_status: "approved" },
      { amount: 2000, transaction_kind: "transfer", financial_account_id: "cash", approval_status: "pending" },
    ];

    const result = calculateClubLedgerSummary(rows, rows, accounts);
    // Only the approved positive transfer counts
    expect(result.transferTotal).toBe(3000);
  });

  it("handles empty rows", () => {
    const result = calculateClubLedgerSummary([], [], accounts);
    expect(result.income).toBe(0);
    expect(result.expense).toBe(0);
    expect(result.balance).toBe(0);
    expect(result.transferTotal).toBe(0);
    expect(result.walletBalances["cash"]).toBe(0);
    expect(result.walletBalances["bank"]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Transfer exclusion in aggregate helpers
// ---------------------------------------------------------------------------

describe("aggregate helpers with transfers", () => {
  it("excludeTransfers filters out transfer rows from income total", () => {
    const rows = [
      { amount: 1000, transaction_kind: "income" },
      { amount: 500, transaction_kind: "transfer" },
      { amount: 200, transaction_kind: "income" },
    ];
    expect(calculateIncomeTotal(rows, { excludeTransfers: true })).toBe(1200);
    expect(calculateIncomeTotal(rows)).toBe(1700);
  });

  it("excludeTransfers filters out transfer rows from expense total", () => {
    const rows = [
      { amount: -1000, transaction_kind: "expense" },
      { amount: -500, transaction_kind: "transfer" },
    ];
    expect(calculateExpenseTotal(rows, { excludeTransfers: true })).toBe(1000);
    expect(calculateExpenseTotal(rows)).toBe(1500);
  });

  it("financialAccountId filter works with transfers", () => {
    const rows = [
      { amount: 1000, financial_account_id: "cash", transaction_kind: "income" },
      { amount: 2000, financial_account_id: "bank", transaction_kind: "income" },
      { amount: 500, financial_account_id: "cash", transaction_kind: "transfer" },
    ];
    expect(
      calculateIncomeTotal(rows, {
        financialAccountId: "cash",
        excludeTransfers: true,
      }),
    ).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

describe("club ledger permissions", () => {
  const adminAccess: RoleAccessContext = {
    roles: [{ name: "admin", type: "admin", accountingGroupId: null }],
    isAdmin: true,
    hasAccountingRole: false,
    canManageMembers: true,
    groupRoleTypes: {},
  };

  const accountingAccess: RoleAccessContext = {
    roles: [{ name: "会計", type: "accounting", accountingGroupId: null }],
    isAdmin: false,
    hasAccountingRole: true,
    canManageMembers: true,
    groupRoleTypes: {},
  };

  const generalAccess: RoleAccessContext = {
    roles: [{ name: "一般", type: "general", accountingGroupId: "grp-1" }],
    isAdmin: false,
    hasAccountingRole: false,
    canManageMembers: false,
    groupRoleTypes: { "grp-1": ["general"] },
  };

  describe("canViewClubLedger", () => {
    it("returns true for admin", () => {
      expect(canViewClubLedger(adminAccess)).toBe(true);
    });

    it("returns true for accounting", () => {
      expect(canViewClubLedger(accountingAccess)).toBe(true);
    });

    it("returns false for general user", () => {
      expect(canViewClubLedger(generalAccess)).toBe(false);
    });
  });

  describe("canCreateClubTransaction", () => {
    it("returns true for admin", () => {
      expect(canCreateClubTransaction(adminAccess)).toBe(true);
    });

    it("returns true for accounting", () => {
      expect(canCreateClubTransaction(accountingAccess)).toBe(true);
    });

    it("returns false for general user", () => {
      expect(canCreateClubTransaction(generalAccess)).toBe(false);
    });
  });

  describe("canManageFinancialAccounts", () => {
    it("returns true for admin", () => {
      expect(canManageFinancialAccounts(adminAccess)).toBe(true);
    });

    it("returns false for accounting", () => {
      expect(canManageFinancialAccounts(accountingAccess)).toBe(false);
    });

    it("returns false for general user", () => {
      expect(canManageFinancialAccounts(generalAccess)).toBe(false);
    });
  });
});
