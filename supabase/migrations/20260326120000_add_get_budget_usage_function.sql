-- Migration: Add get_budget_usage RPC function
-- Purpose: Move budget aggregation from client-side to server-side SQL,
--          eliminating the need to transfer all transactions to the client.

CREATE OR REPLACE FUNCTION public.get_budget_usage(p_fiscal_year_id integer)
RETURNS TABLE(accounting_group_id uuid, expenses numeric, pending numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH processed_subsidy_ids AS (
    -- Subsidy items that have been processed (approved/receipt_submitted/paid)
    SELECT id
    FROM subsidy_items
    WHERE fiscal_year_id = p_fiscal_year_id
      AND status IN ('approved', 'receipt_submitted', 'paid')
      AND deleted_at IS NULL
  ),
  -- Pick one related transaction per subsidy item (matching JS .find() behavior)
  subsidy_related_tx AS (
    SELECT DISTINCT ON (t.subsidy_item_id)
      t.subsidy_item_id,
      t.accounting_group_id
    FROM transactions t
    WHERE t.fiscal_year_id = p_fiscal_year_id
      AND t.subsidy_item_id IS NOT NULL
      AND t.deleted_at IS NULL
    ORDER BY t.subsidy_item_id, t.created_at ASC
  ),
  tx_rows AS (
    -- Regular transactions excluding those linked to processed subsidy items
    SELECT
      t.accounting_group_id,
      t.approval_status::text AS approval_status,
      t.amount
    FROM transactions t
    WHERE t.fiscal_year_id = p_fiscal_year_id
      AND t.deleted_at IS NULL
      AND (
        t.subsidy_item_id IS NULL
        OR t.subsidy_item_id NOT IN (SELECT id FROM processed_subsidy_ids)
      )
  ),
  subsidy_expense_rows AS (
    -- Virtual expense rows for processed subsidy items: -actual_amount, status='refunded'
    SELECT
      COALESCE(rt.accounting_group_id, si.accounting_group_id) AS accounting_group_id,
      'refunded' AS approval_status,
      -si.actual_amount AS amount
    FROM subsidy_items si
    LEFT JOIN subsidy_related_tx rt ON rt.subsidy_item_id = si.id
    WHERE si.fiscal_year_id = p_fiscal_year_id
      AND si.status IN ('approved', 'receipt_submitted', 'paid')
      AND si.deleted_at IS NULL
      AND COALESCE(si.actual_amount, 0) > 0
  ),
  subsidy_income_rows AS (
    -- Virtual income rows for processed subsidy items: +approved_amount
    SELECT
      COALESCE(rt.accounting_group_id, si.accounting_group_id) AS accounting_group_id,
      CASE WHEN si.status = 'paid' THEN 'refunded' ELSE 'approved' END AS approval_status,
      si.approved_amount AS amount
    FROM subsidy_items si
    LEFT JOIN subsidy_related_tx rt ON rt.subsidy_item_id = si.id
    WHERE si.fiscal_year_id = p_fiscal_year_id
      AND si.status IN ('approved', 'receipt_submitted', 'paid')
      AND si.deleted_at IS NULL
      AND COALESCE(si.approved_amount, 0) > 0
  ),
  all_rows AS (
    SELECT accounting_group_id, approval_status, amount FROM tx_rows
    UNION ALL
    SELECT accounting_group_id, approval_status, amount FROM subsidy_expense_rows
    UNION ALL
    SELECT accounting_group_id, approval_status, amount FROM subsidy_income_rows
  )
  SELECT
    all_rows.accounting_group_id,
    COALESCE(SUM(
      CASE
        WHEN approval_status = 'refunded' AND amount < 0 THEN ABS(amount)
        WHEN approval_status = 'refunded' AND amount > 0 THEN -amount
        ELSE 0
      END
    ), 0) AS expenses,
    COALESCE(SUM(
      CASE
        WHEN approval_status IN ('pending', 'accepted', 'approved') AND amount < 0 THEN ABS(amount)
        WHEN approval_status IN ('pending', 'accepted', 'approved') AND amount > 0 THEN -amount
        ELSE 0
      END
    ), 0) AS pending
  FROM all_rows
  WHERE all_rows.accounting_group_id IS NOT NULL
  GROUP BY all_rows.accounting_group_id;
$$;
