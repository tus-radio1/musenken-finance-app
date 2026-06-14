-- Migration: Add club-wide ledger with financial accounts and transfer support
-- Purpose:
--   1. Create financial_accounts table (wallets: cash box, bank account)
--   2. Add 部全体 accounting group (type=club)
--   3. Add financial_account_id, transaction_kind, transfer_id to transactions
--   4. Backfill existing transactions with default financial account and kind
--   5. Update ledger view with new columns
--   6. Update get_budget_usage to exclude transfers
--   7. Add create_transfer RPC for atomic 2-row transfer insertion
--   8. Add RLS policies for financial_accounts and club-wide transactions

-- =============================================================================
-- 1. financial_accounts table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial financial accounts
INSERT INTO public.financial_accounts (name, type, display_order)
VALUES
  ('金庫', 'cash', 10),
  ('銀行口座', 'bank', 20)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- 2. Add 部全体 accounting group (type=club)
-- =============================================================================

-- accounting_groups.type has no CHECK constraint or enum -- it uses free-text
-- with convention values 'general', 'leader'. We add 'club' for club-wide.
INSERT INTO public.accounting_groups (name, type, is_active)
VALUES ('部全体', 'club', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Ensure is_active and updated_at columns exist on accounting_groups
-- (they may have been added by a later migration)
ALTER TABLE public.accounting_groups
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.accounting_groups
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =============================================================================
-- 3. Add new columns to transactions
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS financial_account_id UUID REFERENCES public.financial_accounts(id);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transaction_kind TEXT;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_id UUID;

-- =============================================================================
-- 4. Backfill existing transactions
-- =============================================================================

-- Set financial_account_id to 金庫 for all existing rows that lack it
UPDATE public.transactions
SET financial_account_id = (
  SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1
)
WHERE financial_account_id IS NULL;

-- Derive transaction_kind from amount sign for existing rows
UPDATE public.transactions
SET transaction_kind = CASE
  WHEN amount >= 0 THEN 'income'
  ELSE 'expense'
END
WHERE transaction_kind IS NULL;

-- =============================================================================
-- 5. Set NOT NULL and CHECK constraints after backfill
-- =============================================================================

ALTER TABLE public.transactions
  ALTER COLUMN financial_account_id SET NOT NULL;

ALTER TABLE public.transactions
  ALTER COLUMN transaction_kind SET NOT NULL;

-- Add CHECK constraint for transaction_kind values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_transaction_kind_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_transaction_kind_check
      CHECK (transaction_kind IN ('income', 'expense', 'transfer'));
  END IF;
END $$;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_transactions_financial_account
  ON public.transactions(financial_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_kind
  ON public.transactions(transaction_kind);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_id
  ON public.transactions(transfer_id);

-- =============================================================================
-- 6. Update ledger view to include new columns
-- =============================================================================

-- security_invoker so the transactions RLS (including the club-wide
-- visibility restriction) applies when the view is queried directly.
-- DROP first because CREATE OR REPLACE cannot reorder existing columns.
DROP VIEW IF EXISTS v_ledger_transactions;
CREATE VIEW v_ledger_transactions
WITH (security_invoker = on) AS
SELECT
  t.id,
  t.date,
  t.amount,
  t.description,
  t.accounting_group_id,
  t.approval_status,
  t.receipt_url,
  t.created_by,
  t.approved_by,
  t.rejected_reason,
  t.remarks,
  t.subsidy_item_id,
  t.fiscal_year_id,
  t.financial_account_id,
  t.transaction_kind,
  t.transfer_id,
  fa.name AS financial_account_name,
  p_creator.name AS created_by_name,
  p_approver.name AS approved_by_name
FROM transactions t
LEFT JOIN financial_accounts fa ON t.financial_account_id = fa.id
LEFT JOIN profiles p_creator ON t.created_by = p_creator.id
LEFT JOIN profiles p_approver ON t.approved_by = p_approver.id;

-- =============================================================================
-- 7. Update get_budget_usage to exclude transfers
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_budget_usage(integer);

CREATE FUNCTION public.get_budget_usage(p_fiscal_year_id integer)
RETURNS TABLE(accounting_group_id uuid, expenses numeric, pending numeric, income numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH processed_subsidy_ids AS (
    SELECT id FROM subsidy_items
    WHERE fiscal_year_id = p_fiscal_year_id
      AND status IN ('approved', 'receipt_submitted', 'paid')
      AND deleted_at IS NULL
  ),
  subsidy_related_tx AS (
    SELECT DISTINCT ON (t.subsidy_item_id)
      t.subsidy_item_id, t.accounting_group_id
    FROM transactions t
    WHERE t.fiscal_year_id = p_fiscal_year_id
      AND t.subsidy_item_id IS NOT NULL
      AND t.deleted_at IS NULL
    ORDER BY t.subsidy_item_id, t.created_at ASC
  ),
  tx_rows AS (
    SELECT t.accounting_group_id, t.approval_status::text, t.amount
    FROM transactions t
    WHERE t.fiscal_year_id = p_fiscal_year_id
      AND t.deleted_at IS NULL
      AND t.transaction_kind <> 'transfer'
      AND (t.subsidy_item_id IS NULL OR t.subsidy_item_id NOT IN (SELECT id FROM processed_subsidy_ids))
  ),
  subsidy_expense_rows AS (
    SELECT COALESCE(rt.accounting_group_id, si.accounting_group_id), 'refunded'::text, -si.actual_amount
    FROM subsidy_items si
    LEFT JOIN subsidy_related_tx rt ON rt.subsidy_item_id = si.id
    WHERE si.fiscal_year_id = p_fiscal_year_id
      AND si.status IN ('approved', 'receipt_submitted', 'paid')
      AND si.deleted_at IS NULL
      AND COALESCE(si.actual_amount, 0) > 0
  ),
  subsidy_income_rows AS (
    SELECT
      COALESCE(rt.accounting_group_id, si.accounting_group_id),
      CASE WHEN si.status = 'paid' THEN 'refunded' ELSE 'approved' END::text,
      si.approved_amount
    FROM subsidy_items si
    LEFT JOIN subsidy_related_tx rt ON rt.subsidy_item_id = si.id
    WHERE si.fiscal_year_id = p_fiscal_year_id
      AND si.status IN ('approved', 'receipt_submitted', 'paid')
      AND si.deleted_at IS NULL
      AND COALESCE(si.approved_amount, 0) > 0
  ),
  all_rows AS (
    SELECT * FROM tx_rows
    UNION ALL
    SELECT * FROM subsidy_expense_rows
    UNION ALL
    SELECT * FROM subsidy_income_rows
  )
  SELECT
    all_rows.accounting_group_id,
    COALESCE(SUM(
      CASE
        WHEN approval_status IN ('refunded', 'receipt_received', 'received') AND amount < 0 THEN ABS(amount)
        ELSE 0
      END
    ), 0) AS expenses,
    COALESCE(SUM(
      CASE
        WHEN approval_status IN ('pending', 'accepted', 'approved') AND amount < 0 THEN ABS(amount)
        ELSE 0
      END
    ), 0) AS pending,
    COALESCE(SUM(
      CASE
        WHEN amount > 0 AND approval_status NOT IN ('rejected') THEN amount
        ELSE 0
      END
    ), 0) AS income
  FROM all_rows
  WHERE all_rows.accounting_group_id IS NOT NULL
  GROUP BY all_rows.accounting_group_id;
$$;

-- =============================================================================
-- 8. create_transfer RPC for atomic 2-row transfer insertion
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_transfer(
  p_date DATE,
  p_amount INTEGER,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_description TEXT,
  p_receipt_url TEXT DEFAULT NULL,
  p_remarks TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id UUID := gen_random_uuid();
  v_club_group_id UUID;
  v_fiscal_year_id INTEGER;
  -- auth.uid() is authoritative when called with a user JWT; p_created_by is
  -- only honored for service-role calls where auth.uid() is NULL.
  v_created_by UUID := COALESCE(auth.uid(), p_created_by);
BEGIN
  -- SECURITY DEFINER bypasses RLS, so enforce authorization here as well:
  -- only accounting staff/admins (or service-role callers) may create transfers.
  IF auth.uid() IS NOT NULL AND NOT is_accounting_or_admin() THEN
    RAISE EXCEPTION 'Insufficient privileges to create a transfer';
  END IF;

  -- Validate: different accounts
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Source and destination accounts must be different';
  END IF;

  -- Validate: positive amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive';
  END IF;

  -- Get the 部全体 accounting group
  SELECT id INTO v_club_group_id
  FROM accounting_groups
  WHERE type = 'club'
  LIMIT 1;

  IF v_club_group_id IS NULL THEN
    RAISE EXCEPTION 'Club-wide accounting group not found';
  END IF;

  -- Determine fiscal year from the date
  SELECT year INTO v_fiscal_year_id
  FROM fiscal_years
  WHERE start_date <= p_date AND end_date >= p_date
  LIMIT 1;

  -- Insert the outgoing leg (negative amount from source)
  INSERT INTO transactions (
    id, date, amount, description, accounting_group_id,
    fiscal_year_id, financial_account_id, transaction_kind, transfer_id,
    receipt_url, remarks, created_by, approval_status
  ) VALUES (
    gen_random_uuid(), p_date, -p_amount, p_description, v_club_group_id,
    v_fiscal_year_id, p_from_account_id, 'transfer', v_transfer_id,
    p_receipt_url, p_remarks, v_created_by, 'pending'
  );

  -- Insert the incoming leg (positive amount to destination)
  INSERT INTO transactions (
    id, date, amount, description, accounting_group_id,
    fiscal_year_id, financial_account_id, transaction_kind, transfer_id,
    receipt_url, remarks, created_by, approval_status
  ) VALUES (
    gen_random_uuid(), p_date, p_amount, p_description, v_club_group_id,
    v_fiscal_year_id, p_to_account_id, 'transfer', v_transfer_id,
    p_receipt_url, p_remarks, v_created_by, 'pending'
  );

  RETURN v_transfer_id;
END;
$$;

-- =============================================================================
-- 9. RLS policies for financial_accounts
-- =============================================================================

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read financial accounts
CREATE POLICY "financial_accounts_select_authenticated"
  ON public.financial_accounts FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update/delete financial accounts
CREATE POLICY "financial_accounts_admin_all"
  ON public.financial_accounts FOR ALL
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- 10. RLS policies for club-wide (部全体) transactions
-- =============================================================================

-- Helper function: check if accounting group is club-wide
CREATE OR REPLACE FUNCTION public.is_club_group(p_accounting_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_groups
    WHERE id = p_accounting_group_id AND type = 'club'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if current user is accounting staff or admin
CREATE OR REPLACE FUNCTION public.is_accounting_or_admin()
RETURNS BOOLEAN AS $$
  SELECT is_admin() OR has_role('会計');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update SELECT policy: club-wide transactions visible only to accounting/admin
-- Drop existing policy and recreate to include club-wide restriction
DROP POLICY IF EXISTS "transactions_select_non_deleted" ON public.transactions;

CREATE POLICY "transactions_select_non_deleted"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      NOT is_club_group(accounting_group_id)
      OR is_accounting_or_admin()
    )
  );

-- Update INSERT policy: club-wide transactions only by accounting/admin
DROP POLICY IF EXISTS "transactions_insert_member" ON public.transactions;

CREATE POLICY "transactions_insert_member"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN is_club_group(accounting_group_id) THEN
        is_accounting_or_admin()
      ELSE
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = auth.uid()
            AND r.accounting_group_id = accounting_group_id
        )
    END
  );
