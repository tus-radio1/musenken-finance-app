-- Migration: Add carryover_amount to budgets and income column to get_budget_usage
-- Purpose:
--   1. Add carryover_amount column to budgets table (Plan C)
--   2. Update get_budget_usage function to:
--      - Include receipt_received / received statuses in expenses (Plan A bugfix)
--      - Add separate income column for positive amounts (Plan B)
--      - Remove income offset from expenses/pending calculations

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS carryover_amount INTEGER NOT NULL DEFAULT 0;

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
