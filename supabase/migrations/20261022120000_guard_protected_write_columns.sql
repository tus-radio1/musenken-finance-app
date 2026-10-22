-- Migration: Guard privilege-relevant columns of subsidy_items / transactions
--
-- Problem:
--   The row-level policies "subsidy_items_insert_own", "subsidy_items_update_own",
--   "transactions_insert_member" and "transactions_update_own" decide WHICH rows a
--   regular member may write, but not WHICH COLUMNS. Through the Data API
--   (PostgREST) an applicant could therefore insert or edit their own pending rows
--   with status / approved_amount / approval_status / approved_by / created_by /
--   applicant_id etc. set to arbitrary values, bypassing the Server Actions.
--
-- Fix:
--   BEFORE INSERT/UPDATE triggers that apply only to non-privileged Data API
--   callers (current_user is "authenticated" or "anon" and the caller is neither
--   admin nor 会計). Privileged paths are unaffected:
--     - service_role (createAdminClient) and SECURITY DEFINER functions
--       (create_transfer, cron jobs) run as a different current_user;
--     - admin / 会計 users (is_admin() / has_role('会計')) are not restricted.
--   UPDATE uses an allowlist (columns the owner may edit via the app); any other
--   column change is rejected, so columns added later are protected by default.
--   INSERT requires protected columns to hold their initial values.
--   Changed receipt / evidence paths must live under the caller's storage prefix
--   (same rule as lib/receipt-upload.ts isReceiptPathOwnedBy).
--   Regular members cannot label a row as a 'transfer' (transfers are excluded
--   from get_budget_usage and must only come from create_transfer).
--
--   create_transfer treats auth.uid() IS NULL as a trusted service-role call,
--   so anonymous callers must not be able to EXECUTE it. The app calls it with
--   the user's session (authenticated) only.
--
-- Rollback (reversible, no data change):
--   DROP TRIGGER IF EXISTS guard_subsidy_items_write ON public.subsidy_items;
--   DROP TRIGGER IF EXISTS guard_transactions_write ON public.transactions;
--   DROP FUNCTION IF EXISTS public.guard_subsidy_items_write();
--   DROP FUNCTION IF EXISTS public.guard_transactions_write();
--   DROP FUNCTION IF EXISTS public.is_receipt_path_owned_by_caller(TEXT);
--   DROP FUNCTION IF EXISTS public.is_restricted_api_writer();
--   GRANT EXECUTE ON FUNCTION public.create_transfer(DATE, INTEGER, UUID, UUID, TEXT, TEXT, TEXT, UUID)
--     TO PUBLIC, anon;

-- =============================================================================
-- Helpers
-- =============================================================================

-- True when the current statement comes from a regular (non-admin, non-会計)
-- Data API user. SECURITY INVOKER on purpose: current_user must be the caller.
CREATE OR REPLACE FUNCTION public.is_restricted_api_writer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- is_admin() / has_role() are called directly (not is_accounting_or_admin())
  -- because their bodies are schema-qualified and work with an empty search_path.
  SELECT current_user IN ('authenticated', 'anon')
    AND NOT (public.is_admin() OR public.has_role('会計'));
$$;

-- Mirrors lib/receipt-upload.ts isReceiptPathOwnedBy for auth.uid().
CREATE OR REPLACE FUNCTION public.is_receipt_path_owned_by_caller(p_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_path ~ '^[a-zA-Z0-9._/-]+$'
    AND strpos(p_path, '..') = 0
    AND starts_with(p_path, auth.uid()::text || '/');
$$;

-- =============================================================================
-- subsidy_items
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_subsidy_items_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- Columns an applicant may edit on their own pending item
  -- (matches updateMySubsidyItem's pending branch).
  owner_editable CONSTANT TEXT[] := ARRAY[
    'category', 'term', 'expense_type', 'income_type', 'date',
    'accounting_group_id', 'name', 'requested_amount', 'justification',
    'usage_period', 'remarks', 'evidence_url', 'updated_at'
  ];
BEGIN
  IF NOT public.is_restricted_api_writer() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.applicant_id IS DISTINCT FROM auth.uid()
      OR NEW.status IS DISTINCT FROM 'pending'
      OR NEW.approved_amount IS NOT NULL
      OR COALESCE(NEW.actual_amount, 0) <> 0
      OR NEW.receipt_url IS NOT NULL
      OR NEW.receipt_date IS NOT NULL
      OR NEW.deleted_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'subsidy_items: protected column set on insert'
        USING ERRCODE = '42501';
    END IF;
  ELSIF (to_jsonb(NEW) - owner_editable) IS DISTINCT FROM (to_jsonb(OLD) - owner_editable) THEN
    RAISE EXCEPTION 'subsidy_items: protected column changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.evidence_url IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.evidence_url IS DISTINCT FROM OLD.evidence_url)
    AND NOT public.is_receipt_path_owned_by_caller(NEW.evidence_url)
  THEN
    RAISE EXCEPTION 'subsidy_items: evidence_url outside caller prefix'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_subsidy_items_write ON public.subsidy_items;
CREATE TRIGGER guard_subsidy_items_write
  BEFORE INSERT OR UPDATE ON public.subsidy_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_subsidy_items_write();

-- =============================================================================
-- transactions
-- =============================================================================

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

DROP TRIGGER IF EXISTS guard_transactions_write ON public.transactions;
CREATE TRIGGER guard_transactions_write
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_transactions_write();

-- =============================================================================
-- create_transfer: no anonymous execution
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.create_transfer(DATE, INTEGER, UUID, UUID, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_transfer(DATE, INTEGER, UUID, UUID, TEXT, TEXT, TEXT, UUID)
  TO authenticated, service_role;
