-- Grant only the agreed accounting operations before changing the role data.
-- Reuse is_accounting_or_admin(): accounting is identified by name, not type.
-- Keep ALL policies admin-only and the 20261022120000 guards unchanged.

-- Qualify nested helper calls so SECURITY DEFINER callers can use an empty
-- search_path. This preserves the existing helper's authorization semantics.
CREATE OR REPLACE FUNCTION public.is_accounting_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.is_admin() OR public.has_role('会計');
$$;

CREATE POLICY "transactions_delete_admin_accounting"
  ON public.transactions FOR DELETE
  TO authenticated
  USING (public.is_accounting_or_admin());

-- SELECT policies also constrain the new UPDATE row. Allowing direct soft
-- delete would require deleted-row SELECT access. A narrow SECURITY DEFINER
-- RPC instead grants only deleted_at on a live item, without exposing deleted
-- items, restoration, arbitrary INSERT or hard DELETE.
CREATE OR REPLACE FUNCTION public.soft_delete_subsidy_item(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_id UUID;
BEGIN
  IF NOT public.is_accounting_or_admin() THEN
    RAISE EXCEPTION 'Insufficient privileges to soft-delete a subsidy item'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.subsidy_items
  SET deleted_at = now()
  WHERE id = p_id AND deleted_at IS NULL
  RETURNING id INTO deleted_id;

  RETURN deleted_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.soft_delete_subsidy_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_subsidy_item(UUID) TO authenticated;

-- Group management is creation and activation, not physical cascading DELETE
-- (which would remove budgets, roles and their assignments).
CREATE POLICY "accounting_groups_insert_admin_accounting"
  ON public.accounting_groups FOR INSERT
  TO authenticated
  WITH CHECK (public.is_accounting_or_admin());

CREATE POLICY "accounting_groups_update_admin_accounting"
  ON public.accounting_groups FOR UPDATE
  TO authenticated
  USING (public.is_accounting_or_admin())
  WITH CHECK (public.is_accounting_or_admin());

-- The existing fiscal-year management flow creates a year. Initial budgets
-- still use the authorized server action; no budget write RLS is added.
CREATE POLICY "fiscal_years_insert_admin_accounting"
  ON public.fiscal_years FOR INSERT
  TO authenticated
  WITH CHECK (public.is_accounting_or_admin());
