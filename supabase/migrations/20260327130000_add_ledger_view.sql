CREATE OR REPLACE VIEW v_ledger_transactions AS
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
  p_creator.name AS created_by_name,
  p_approver.name AS approved_by_name
FROM transactions t
LEFT JOIN profiles p_creator ON t.created_by = p_creator.id
LEFT JOIN profiles p_approver ON t.approved_by = p_approver.id;
