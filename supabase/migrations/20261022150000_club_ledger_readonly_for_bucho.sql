-- Read-only club ledger access for 部長 / 副部長, checked by role name.
-- No write predicate uses this helper. Keep is_accounting_or_admin() and the
-- 20261022120000 protected-column guard unchanged.
CREATE OR REPLACE FUNCTION public.can_view_club_ledger()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.is_admin()
    OR public.has_role('会計')
    OR public.has_role('部長')
    OR public.has_role('副部長');
$$;

DROP POLICY IF EXISTS "transactions_select_non_deleted" ON public.transactions;
CREATE POLICY "transactions_select_non_deleted"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      NOT public.is_club_group(accounting_group_id)
      OR public.can_view_club_ledger()
    )
  );

-- The old owner policies also match legacy own-pending club rows. Once those
-- rows become visible, SELECT alone would enable owner UPDATE / DELETE.
-- Restrictive policies preserve read-only access even on those rows, and block
-- moving a non-club row into the club ledger. Non-club rules stay unchanged
-- (the separate PR-B group checks and its six TODO assertions are unaffected).
CREATE POLICY "transactions_update_club_writers_only"
  ON public.transactions AS RESTRICTIVE FOR UPDATE
  TO authenticated
  USING (
    NOT public.is_club_group(accounting_group_id)
    OR public.is_admin() OR public.has_role('会計')
  )
  WITH CHECK (
    NOT public.is_club_group(accounting_group_id)
    OR public.is_admin() OR public.has_role('会計')
  );

CREATE POLICY "transactions_delete_club_writers_only"
  ON public.transactions AS RESTRICTIVE FOR DELETE
  TO authenticated
  USING (
    NOT public.is_club_group(accounting_group_id)
    OR public.is_admin() OR public.has_role('会計')
  );
