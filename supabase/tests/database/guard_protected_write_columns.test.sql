-- pgTAP: protected columns of subsidy_items / transactions cannot be written by a
-- regular member through the Data API (migration 20261022120000).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(26);

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner, RLS not applied)
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'applicant@example.test'),
  ('c0000000-0000-4000-8000-00000000000c', 'accountant@example.test');

INSERT INTO public.profiles (id, name, student_number, grade) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'Applicant', '9999001', 1),
  ('c0000000-0000-4000-8000-00000000000c', 'Accountant', '9999002', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_years (year, start_date, end_date)
VALUES (2099, '2099-04-01', '2100-03-31')
ON CONFLICT (year) DO NOTHING;

INSERT INTO public.accounting_groups (id, name, type)
VALUES ('90000000-0000-4000-8000-000000000009', 'pgtap guard group', 'general');

INSERT INTO public.roles (id, name, type, accounting_group_id) VALUES
  ('91000000-0000-4000-8000-000000000001', 'general', 'general', '90000000-0000-4000-8000-000000000009'),
  ('92000000-0000-4000-8000-000000000002', '会計', 'accounting', NULL);

INSERT INTO public.user_roles (user_id, role_id) VALUES
  ('a0000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-00000000000c', '92000000-0000-4000-8000-000000000002');

INSERT INTO public.subsidy_items (
  id, category, term, expense_type, accounting_group_id, applicant_id,
  fiscal_year_id, name, requested_amount, justification, status, evidence_url
) VALUES (
  '50000000-0000-4000-8000-000000000005', 'activity', 1, 'equipment',
  '90000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-00000000000a',
  2099, 'Original', 1000, 'reason', 'pending',
  'a0000000-0000-4000-8000-00000000000a/evidence.png'
);

INSERT INTO public.transactions (
  id, date, amount, description, accounting_group_id, fiscal_year_id,
  approval_status, created_by, financial_account_id, transaction_kind,
  receipt_url
) VALUES (
  '70000000-0000-4000-8000-000000000007', '2099-05-01', -1000, 'Original',
  '90000000-0000-4000-8000-000000000009', 2099, 'pending',
  'a0000000-0000-4000-8000-00000000000a',
  (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
  'expense', 'legacy-receipt.png'
);

-- Anonymous callers cannot reach the SECURITY DEFINER transfer RPC.
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_transfer(date, integer, uuid, uuid, text, text, text, uuid)',
    'EXECUTE'
  ),
  'anon cannot execute create_transfer'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_transfer(date, integer, uuid, uuid, text, text, text, uuid)',
    'EXECUTE'
  ),
  'authenticated can still execute create_transfer'
);

-- ---------------------------------------------------------------------------
-- Regular member (applicant) via the Data API role
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$UPDATE public.subsidy_items SET status = 'approved'
    WHERE id = '50000000-0000-4000-8000-000000000005'$$,
  '42501', NULL, 'applicant cannot set subsidy status'
);
SELECT throws_ok(
  $$UPDATE public.subsidy_items SET approved_amount = 99999
    WHERE id = '50000000-0000-4000-8000-000000000005'$$,
  '42501', NULL, 'applicant cannot set approved_amount'
);
SELECT throws_ok(
  $$UPDATE public.subsidy_items SET applicant_id = 'c0000000-0000-4000-8000-00000000000c'
    WHERE id = '50000000-0000-4000-8000-000000000005'$$,
  '42501', NULL, 'applicant cannot reassign applicant_id'
);
SELECT throws_ok(
  $$UPDATE public.subsidy_items SET evidence_url = 'c0000000-0000-4000-8000-00000000000c/x.png'
    WHERE id = '50000000-0000-4000-8000-000000000005'$$,
  '42501', NULL, 'applicant cannot point evidence_url at a foreign prefix'
);
SELECT lives_ok(
  $$UPDATE public.subsidy_items
    SET name = 'Edited', requested_amount = 2000,
        evidence_url = 'a0000000-0000-4000-8000-00000000000a/new.png'
    WHERE id = '50000000-0000-4000-8000-000000000005'$$,
  'applicant can edit owner-editable subsidy columns'
);
SELECT lives_ok(
  $$UPDATE public.subsidy_items SET evidence_url = NULL
    WHERE id = '50000000-0000-4000-8000-000000000005'$$,
  'applicant can clear evidence_url'
);
SELECT throws_ok(
  $$INSERT INTO public.subsidy_items (
      category, term, expense_type, accounting_group_id, applicant_id,
      fiscal_year_id, name, requested_amount, justification, status, approved_amount
    ) VALUES (
      'activity', 1, 'equipment', '90000000-0000-4000-8000-000000000009',
      'a0000000-0000-4000-8000-00000000000a', 2099, 'x', 1, 'r', 'approved', 1
    )$$,
  '42501', NULL, 'applicant cannot insert a pre-approved subsidy item'
);
SELECT lives_ok(
  $$INSERT INTO public.subsidy_items (
      category, term, expense_type, accounting_group_id, applicant_id,
      fiscal_year_id, name, requested_amount, justification, status, evidence_url
    ) VALUES (
      'activity', 1, 'equipment', '90000000-0000-4000-8000-000000000009',
      'a0000000-0000-4000-8000-00000000000a', 2099, 'x', 1, 'r', 'pending',
      'a0000000-0000-4000-8000-00000000000a/e.png'
    )$$,
  'applicant can insert a pending subsidy item (createSubsidyItem shape)'
);

SELECT throws_ok(
  $$UPDATE public.transactions SET approval_status = 'approved'
    WHERE id = '70000000-0000-4000-8000-000000000007'$$,
  '42501', NULL, 'creator cannot approve their own transaction'
);
SELECT throws_ok(
  $$UPDATE public.transactions SET approved_by = 'a0000000-0000-4000-8000-00000000000a'
    WHERE id = '70000000-0000-4000-8000-000000000007'$$,
  '42501', NULL, 'creator cannot set approved_by'
);
SELECT throws_ok(
  $$UPDATE public.transactions SET receipt_url = 'c0000000-0000-4000-8000-00000000000c/r.png'
    WHERE id = '70000000-0000-4000-8000-000000000007'$$,
  '42501', NULL, 'creator cannot point receipt_url at a foreign prefix'
);
SELECT throws_ok(
  $$UPDATE public.transactions SET transaction_kind = 'transfer'
    WHERE id = '70000000-0000-4000-8000-000000000007'$$,
  '42501', NULL, 'creator cannot relabel a transaction as a transfer'
);
SELECT lives_ok(
  $$UPDATE public.transactions SET description = 'Legacy receipt kept'
    WHERE id = '70000000-0000-4000-8000-000000000007'$$,
  'an unchanged legacy receipt_url does not block other edits'
);
SELECT lives_ok(
  $$UPDATE public.transactions
    SET amount = -1500, description = 'Edited',
        receipt_url = 'a0000000-0000-4000-8000-00000000000a/r.png'
    WHERE id = '70000000-0000-4000-8000-000000000007'$$,
  'creator can edit owner-editable transaction columns (updateTransaction shape)'
);
SELECT throws_ok(
  $$INSERT INTO public.transactions (
      date, amount, description, accounting_group_id, approval_status,
      created_by, financial_account_id, transaction_kind
    ) VALUES (
      '2099-05-02', -1, 'x', '90000000-0000-4000-8000-000000000009', 'approved',
      'a0000000-0000-4000-8000-00000000000a',
      (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1), 'expense'
    )$$,
  '42501', NULL, 'member cannot insert a pre-approved transaction'
);
SELECT throws_ok(
  $$INSERT INTO public.transactions (
      date, amount, description, accounting_group_id, approval_status,
      created_by, financial_account_id, transaction_kind
    ) VALUES (
      '2099-05-02', -1, 'x', '90000000-0000-4000-8000-000000000009', 'pending',
      'c0000000-0000-4000-8000-00000000000c',
      (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1), 'expense'
    )$$,
  '42501', NULL, 'member cannot insert a transaction on behalf of someone else'
);
SELECT throws_ok(
  $$INSERT INTO public.transactions (
      date, amount, description, accounting_group_id, approval_status,
      created_by, financial_account_id, transaction_kind
    ) VALUES (
      '2099-05-02', -1, 'x', '90000000-0000-4000-8000-000000000009', 'pending',
      'a0000000-0000-4000-8000-00000000000a',
      (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1), 'transfer'
    )$$,
  '42501', NULL, 'member cannot insert a transfer-labelled transaction'
);
SELECT lives_ok(
  $$INSERT INTO public.transactions (
      date, amount, description, accounting_group_id, approval_status,
      created_by, financial_account_id, transaction_kind, receipt_url
    ) VALUES (
      '2099-05-02', -1, 'x', '90000000-0000-4000-8000-000000000009', 'pending',
      'a0000000-0000-4000-8000-00000000000a',
      (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1), 'expense',
      'a0000000-0000-4000-8000-00000000000a/new.png'
    )$$,
  'member can insert a pending transaction (createTransaction shape)'
);

-- ---------------------------------------------------------------------------
-- 会計 via the Data API role: approval flows keep working
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $$UPDATE public.subsidy_items SET status = 'approved', approved_amount = 1000
    WHERE id = '50000000-0000-4000-8000-000000000005'$$,
  '会計 can approve a subsidy item'
);
SELECT lives_ok(
  $$UPDATE public.transactions
    SET approval_status = 'approved',
        approved_by = 'c0000000-0000-4000-8000-00000000000c'
    WHERE id = '70000000-0000-4000-8000-000000000007'$$,
  '会計 can approve a transaction'
);

-- ---------------------------------------------------------------------------
-- service_role (createAdminClient): unaffected
-- ---------------------------------------------------------------------------
RESET ROLE;
-- No end-user JWT: the exemption must come from the service_role itself.
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$UPDATE public.subsidy_items
    SET receipt_url = 'a0000000-0000-4000-8000-00000000000a/receipt.png'
    WHERE id = '50000000-0000-4000-8000-000000000005'$$,
  'service_role can write receipt_url (updateMySubsidyItem path)'
);

RESET ROLE;

SELECT is(
  (SELECT status::text FROM public.subsidy_items
    WHERE id = '50000000-0000-4000-8000-000000000005'),
  'approved',
  'only the 会計 update changed the subsidy status'
);
SELECT is(
  (SELECT approval_status::text FROM public.transactions
    WHERE id = '70000000-0000-4000-8000-000000000007'),
  'approved',
  'the 会計 approval of the transaction was persisted'
);
SELECT is(
  (SELECT name FROM public.subsidy_items
    WHERE id = '50000000-0000-4000-8000-000000000005'),
  'Edited',
  'the permitted applicant edit was persisted'
);

SELECT * FROM finish();
ROLLBACK;
