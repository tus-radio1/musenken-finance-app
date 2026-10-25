-- Add accounting visibility without altering own-row SELECT or INSERT policies.
CREATE POLICY audit_logs_select_accounting
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.is_accounting_or_admin());
