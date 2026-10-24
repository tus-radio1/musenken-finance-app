-- PR-B steps 11/12: close Data API approval and group-filing bypasses.
-- Compatible with the deployed PR-A app and accounting role split.
-- No existing rows are rewritten or validated, including historical self approvals.
-- Rollback (reopens the bypasses): restore transactions_insert_member from
-- 20260612120000 and guard_transactions_write from 20261022120000, then
-- DROP FUNCTION public.can_file_into_group(UUID). Prefer roll-forward.

-- Match lib/roles/permissions.ts canFileTransactionInGroup exactly. Unknown
-- non-club types (including production 'team') require group membership unless
-- the actor has global non-club access. Inactive groups are not special-cased.
CREATE OR REPLACE FUNCTION public.can_file_into_group(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_groups g
    WHERE g.id = p_group_id
      AND CASE WHEN g.type = 'club' THEN public.is_accounting_or_admin()
        ELSE public.is_admin() OR public.has_role('会計')
          OR public.has_role('部長') OR public.has_role('副部長')
          OR g.type = 'general' OR g.type IS NULL
          OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = auth.uid() AND r.accounting_group_id = p_group_id
          )
      END
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_file_into_group(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_file_into_group(UUID) TO authenticated, service_role;

DROP POLICY "transactions_insert_member" ON public.transactions;
CREATE POLICY "transactions_insert_member"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (public.can_file_into_group(accounting_group_id));

-- Extend the existing guard rather than add a second trigger with ordering
-- dependencies. Preserve its owner allowlist, receipt and transfer checks below.
CREATE OR REPLACE FUNCTION public.guard_transactions_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- Columns a creator may edit on their own pending transaction
  -- (matches updateTransaction for non-admin / non-会計 users).
  owner_editable CONSTANT TEXT[] := ARRAY[
    'amount', 'description', 'fiscal_year_id', 'date', 'accounting_group_id',
    'financial_account_id', 'transaction_kind', 'receipt_url', 'remarks',
    'updated_at'
  ];
BEGIN
  -- SECURITY INVOKER: trusted service/definer paths retain their current_user.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Only actual destination changes are checked: historical outsider rows
  -- remain editable, including when the client resubmits the existing group.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.accounting_group_id IS DISTINCT FROM OLD.accounting_group_id
      AND NOT public.can_file_into_group(NEW.accounting_group_id)
    THEN
      RAISE EXCEPTION 'transactions: destination group not allowed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Admin edit-form corrections (including self-row corrections) are allowed.
  -- Normal-flow self-approval and the break-glass audit are enforced by the app.
  IF NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.created_by IS DISTINCT FROM auth.uid()
        OR NEW.approval_status IS DISTINCT FROM 'pending'
        OR NEW.approved_by IS NOT NULL
        OR NEW.approved_at IS NOT NULL
        OR NEW.rejected_reason IS NOT NULL
      THEN
        RAISE EXCEPTION 'transactions: initial creator or approval fields not allowed'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'transactions: created_by reassignment requires admin'
          USING ERRCODE = '42501';
      END IF;

      IF ROW(NEW.approval_status, NEW.approved_by, NEW.approved_at, NEW.rejected_reason)
        IS DISTINCT FROM
        ROW(OLD.approval_status, OLD.approved_by, OLD.approved_at, OLD.rejected_reason)
      THEN
        IF NOT public.has_role('会計')
          OR OLD.created_by = auth.uid() OR NEW.created_by = auth.uid()
        THEN
          -- Preserve the existing API error for protected-column edits.
          RAISE EXCEPTION 'transactions: protected column changed'
            USING ERRCODE = '42501';
        END IF;

        -- A decision records the actor; an edit-form reset clears the approver.
        -- Independent approver reassignment remains admin-only.
        IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
          IF (NEW.approval_status IN ('approved', 'rejected')
                AND NEW.approved_by IS DISTINCT FROM auth.uid())
            OR (NEW.approval_status = 'pending' AND NEW.approved_by IS NOT NULL)
            OR (NEW.approval_status NOT IN ('pending', 'approved', 'rejected')
                AND NEW.approved_by IS DISTINCT FROM OLD.approved_by)
          THEN
            RAISE EXCEPTION 'transactions: invalid approver for status change'
              USING ERRCODE = '42501';
          END IF;
        ELSIF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
          RAISE EXCEPTION 'transactions: approved_by reassignment requires admin'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NOT public.is_restricted_api_writer() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid()
      OR NEW.approval_status IS DISTINCT FROM 'pending'
      OR NEW.approved_by IS NOT NULL
      OR NEW.approved_at IS NOT NULL
      OR NEW.rejected_reason IS NOT NULL
      OR NEW.subsidy_item_id IS NOT NULL
      OR NEW.transfer_id IS NOT NULL
      OR NEW.deleted_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'transactions: protected column set on insert'
        USING ERRCODE = '42501';
    END IF;
  ELSIF (to_jsonb(NEW) - owner_editable) IS DISTINCT FROM (to_jsonb(OLD) - owner_editable) THEN
    RAISE EXCEPTION 'transactions: protected column changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.transaction_kind NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'transactions: transaction_kind not allowed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.receipt_url IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.receipt_url IS DISTINCT FROM OLD.receipt_url)
    AND NOT public.is_receipt_path_owned_by_caller(NEW.receipt_url)
  THEN
    RAISE EXCEPTION 'transactions: receipt_url outside caller prefix'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
