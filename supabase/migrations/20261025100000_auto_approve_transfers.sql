-- Transfers stay inside the club: accounting/admin creation is the approval.
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
SET search_path = ''
AS $$
DECLARE
  v_transfer_id UUID := pg_catalog.gen_random_uuid();
  v_club_group_id UUID;
  v_fiscal_year_id INTEGER;
  -- auth.uid() is authoritative when called with a user JWT; p_created_by is
  -- only honored for service-role calls where auth.uid() is NULL.
  v_created_by UUID := COALESCE(auth.uid(), p_created_by);
BEGIN
  -- SECURITY DEFINER bypasses RLS, so enforce authorization here as well:
  -- only accounting staff/admins (or service-role callers) may create transfers.
  IF auth.uid() IS NOT NULL AND NOT public.is_accounting_or_admin() THEN
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
  FROM public.accounting_groups
  WHERE type = 'club'
  LIMIT 1;

  IF v_club_group_id IS NULL THEN
    RAISE EXCEPTION 'Club-wide accounting group not found';
  END IF;

  -- Determine fiscal year from the date
  SELECT year INTO v_fiscal_year_id
  FROM public.fiscal_years
  WHERE start_date <= p_date AND end_date >= p_date
  LIMIT 1;

  -- Insert both approved legs and their audit entries in the same transaction.
  -- SECURITY DEFINER preserves the protected-column guards for direct API writes.
  WITH legs AS (
    INSERT INTO public.transactions (
      id, date, amount, description, accounting_group_id,
      fiscal_year_id, financial_account_id, transaction_kind, transfer_id,
      receipt_url, remarks, created_by, approval_status, approved_by, approved_at
    ) VALUES (
      pg_catalog.gen_random_uuid(), p_date, -p_amount, p_description, v_club_group_id,
      v_fiscal_year_id, p_from_account_id, 'transfer', v_transfer_id,
      p_receipt_url, p_remarks, v_created_by, 'approved', v_created_by, now()
    ), (
      pg_catalog.gen_random_uuid(), p_date, p_amount, p_description, v_club_group_id,
      v_fiscal_year_id, p_to_account_id, 'transfer', v_transfer_id,
      p_receipt_url, p_remarks, v_created_by, 'approved', v_created_by, now()
    )
    RETURNING *
  )
  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, changed_by)
  SELECT 'transactions', legs.id, 'INSERT', to_jsonb(legs), v_created_by
  FROM legs;

  RETURN v_transfer_id;
END;
$$;

-- Preserve the restricted RPC surface from the protected-column migration.
REVOKE EXECUTE ON FUNCTION public.create_transfer(DATE, INTEGER, UUID, UUID, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_transfer(DATE, INTEGER, UUID, UUID, TEXT, TEXT, TEXT, UUID)
  TO authenticated, service_role;
