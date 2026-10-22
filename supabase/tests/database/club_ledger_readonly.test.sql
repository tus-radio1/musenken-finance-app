-- Read-only club access, including legacy own-pending rows and transfers.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(41);

INSERT INTO auth.users (id, email) VALUES
  ('a8100000-0000-4000-8000-000000000001', 'club-chair@example.test'),
  ('a8200000-0000-4000-8000-000000000002', 'club-vice@example.test'),
  ('a8300000-0000-4000-8000-000000000003', 'club-member@example.test');
INSERT INTO public.profiles (id, name, student_number, grade) VALUES
  ('a8100000-0000-4000-8000-000000000001', 'Chair', '9997101', 1),
  ('a8200000-0000-4000-8000-000000000002', 'Vice', '9997102', 1),
  ('a8300000-0000-4000-8000-000000000003', 'Member', '9997103', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.roles (id, name, type) VALUES
  ('a8400000-0000-4000-8000-000000000001', '部長', 'general'),
  ('a8400000-0000-4000-8000-000000000002', '副部長', 'general');
INSERT INTO public.user_roles (user_id, role_id) VALUES
  ('a8100000-0000-4000-8000-000000000001', 'a8400000-0000-4000-8000-000000000001'),
  ('a8200000-0000-4000-8000-000000000002', 'a8400000-0000-4000-8000-000000000002');
INSERT INTO public.accounting_groups (id, name, type) VALUES
  ('a8500000-0000-4000-8000-000000000001', 'pgtap club access', 'club'),
  ('a8500000-0000-4000-8000-000000000002', 'pgtap non-club access', 'general');
INSERT INTO public.fiscal_years (year, start_date, end_date)
VALUES (2097, '2097-04-01', '2098-03-31');
INSERT INTO public.budgets (accounting_group_id, fiscal_year_id, amount)
VALUES ('a8500000-0000-4000-8000-000000000001', 2097, 1000);
INSERT INTO public.subsidy_items (
  id, category, term, expense_type, accounting_group_id, applicant_id,
  fiscal_year_id, name, requested_amount, justification, status
) VALUES (
  'a8600000-0000-4000-8000-000000000001', 'activity', 1, 'equipment',
  'a8500000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001',
  2097, 'Club subsidy', 100, 'reason', 'approved'
);
-- Both readers own pending club and non-club rows. Transfer legs are read from
-- transactions too; there is no separate transfers table or balance read RPC.
INSERT INTO public.transactions (
  id, date, amount, description, accounting_group_id, fiscal_year_id,
  approval_status, created_by, financial_account_id, transaction_kind, transfer_id
)
SELECT v.id::uuid, '2097-05-01', v.amount, 'Club read fixture', v.group_id::uuid, 2097,
  'pending', v.owner_id::uuid,
  (SELECT id FROM public.financial_accounts WHERE name = v.wallet LIMIT 1),
  v.kind, v.transfer_id::uuid
FROM (VALUES
  ('a8700000-0000-4000-8000-000000000001', -100, 'a8500000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001', '金庫', 'expense', NULL),
  ('a8700000-0000-4000-8000-000000000002', -100, 'a8500000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000002', '金庫', 'expense', NULL),
  ('a8700000-0000-4000-8000-000000000003', -100, 'a8500000-0000-4000-8000-000000000002', 'a8100000-0000-4000-8000-000000000001', '金庫', 'expense', NULL),
  ('a8700000-0000-4000-8000-000000000004', -100, 'a8500000-0000-4000-8000-000000000002', 'a8200000-0000-4000-8000-000000000002', '金庫', 'expense', NULL),
  ('a8700000-0000-4000-8000-000000000005', -100, 'a8500000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001', '金庫', 'transfer', 'a8800000-0000-4000-8000-000000000001'),
  ('a8700000-0000-4000-8000-000000000006', 100, 'a8500000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001', '銀行口座', 'transfer', 'a8800000-0000-4000-8000-000000000001')
) AS v(id, amount, group_id, owner_id, wallet, kind, transfer_id);

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT ok(public.can_view_club_ledger(), '部長 can view club ledger');
SELECT is((SELECT count(*) FROM public.transactions WHERE accounting_group_id = 'a8500000-0000-4000-8000-000000000001'), 4::bigint, '部長 reads transactions');
SELECT is((SELECT count(*) FROM public.v_ledger_transactions WHERE accounting_group_id = 'a8500000-0000-4000-8000-000000000001'), 4::bigint, '部長 reads v_ledger_transactions');
SELECT is((SELECT count(*) FROM public.financial_accounts WHERE name IN ('金庫', '銀行口座')), 2::bigint, '部長 reads financial_accounts');
SELECT is((SELECT count(*) FROM public.accounting_groups WHERE id = 'a8500000-0000-4000-8000-000000000001'), 1::bigint, '部長 reads accounting_groups');
SELECT is((SELECT count(*) FROM public.budgets WHERE accounting_group_id = 'a8500000-0000-4000-8000-000000000001' AND fiscal_year_id = 2097), 1::bigint, '部長 reads budgets');
SELECT is((SELECT count(*) FROM public.subsidy_items WHERE id = 'a8600000-0000-4000-8000-000000000001'), 1::bigint, '部長 reads subsidy_items');
SELECT is((SELECT count(*) FROM public.profiles WHERE id = 'a8100000-0000-4000-8000-000000000001'), 1::bigint, '部長 reads profiles');
SELECT is((SELECT count(*) FROM public.fiscal_years WHERE year = 2097), 1::bigint, '部長 reads fiscal_years');
SELECT throws_ok($$INSERT INTO public.transactions (
  date, amount, description, accounting_group_id, fiscal_year_id, created_by, financial_account_id, transaction_kind
) VALUES ('2097-05-01', -100, 'Denied', 'a8500000-0000-4000-8000-000000000001', 2097,
  'a8100000-0000-4000-8000-000000000001', (SELECT id FROM public.financial_accounts WHERE name = '金庫'), 'expense')$$,
  '42501', NULL, '部長 cannot insert club transactions');
WITH changed AS (UPDATE public.transactions SET description = 'denied' WHERE id = 'a8700000-0000-4000-8000-000000000001' RETURNING id)
SELECT is((SELECT count(*) FROM changed), 0::bigint, '部長 cannot edit own pending club row');
WITH changed AS (DELETE FROM public.transactions WHERE id = 'a8700000-0000-4000-8000-000000000001' RETURNING id)
SELECT is((SELECT count(*) FROM changed), 0::bigint, '部長 cannot delete own pending club row');
WITH changed AS (UPDATE public.transactions SET approval_status = 'approved' WHERE id = 'a8700000-0000-4000-8000-000000000001' RETURNING id)
SELECT is((SELECT count(*) FROM changed), 0::bigint, '部長 cannot approve own pending club row');
WITH changed AS (UPDATE public.transactions SET accounting_group_id = 'a8500000-0000-4000-8000-000000000002' WHERE id = 'a8700000-0000-4000-8000-000000000001' RETURNING id)
SELECT is((SELECT count(*) FROM changed), 0::bigint, '部長 cannot move out own pending club row');
SELECT throws_ok($$UPDATE public.transactions SET accounting_group_id = 'a8500000-0000-4000-8000-000000000001' WHERE id = 'a8700000-0000-4000-8000-000000000003'$$, '42501', NULL, '部長 cannot move own non-club row into club');
SELECT ok(public.is_restricted_api_writer(), '部長 remains subject to the 20261022120000 guard');
SELECT throws_ok($$UPDATE public.transactions SET approval_status = 'approved' WHERE id = 'a8700000-0000-4000-8000-000000000003'$$, '42501', 'transactions: protected column changed', '部長 protected-column guard still executes on own non-club row');
SELECT throws_ok($$SELECT public.create_transfer('2097-05-01', 100, (SELECT id FROM public.financial_accounts WHERE name = '金庫'), (SELECT id FROM public.financial_accounts WHERE name = '銀行口座'), 'Denied')$$, 'P0001', 'Insufficient privileges to create a transfer', '部長 cannot create transfers');
WITH changed AS (UPDATE public.financial_accounts SET name = 'Denied' WHERE name = '金庫' RETURNING id)
SELECT is((SELECT count(*) FROM changed), 0::bigint, '部長 cannot edit wallets');

SELECT set_config('request.jwt.claims', '{"sub":"a8200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT ok(public.can_view_club_ledger(), '副部長 can view club ledger');
SELECT is((SELECT count(*) FROM public.transactions WHERE accounting_group_id = 'a8500000-0000-4000-8000-000000000001'), 4::bigint, '副部長 reads transactions');
SELECT is((SELECT count(*) FROM public.v_ledger_transactions WHERE accounting_group_id = 'a8500000-0000-4000-8000-000000000001'), 4::bigint, '副部長 reads v_ledger_transactions');
SELECT is((SELECT count(*) FROM public.financial_accounts WHERE name IN ('金庫', '銀行口座')), 2::bigint, '副部長 reads financial_accounts');
SELECT is((SELECT count(*) FROM public.accounting_groups WHERE id = 'a8500000-0000-4000-8000-000000000001'), 1::bigint, '副部長 reads accounting_groups');
SELECT is((SELECT count(*) FROM public.budgets WHERE accounting_group_id = 'a8500000-0000-4000-8000-000000000001' AND fiscal_year_id = 2097), 1::bigint, '副部長 reads budgets');
SELECT is((SELECT count(*) FROM public.subsidy_items WHERE id = 'a8600000-0000-4000-8000-000000000001'), 1::bigint, '副部長 reads subsidy_items');
SELECT is((SELECT count(*) FROM public.profiles WHERE id = 'a8100000-0000-4000-8000-000000000001'), 1::bigint, '副部長 reads profiles');
SELECT is((SELECT count(*) FROM public.fiscal_years WHERE year = 2097), 1::bigint, '副部長 reads fiscal_years');
SELECT throws_ok($$INSERT INTO public.transactions (
  date, amount, description, accounting_group_id, fiscal_year_id, created_by, financial_account_id, transaction_kind
) VALUES ('2097-05-01', -100, 'Denied', 'a8500000-0000-4000-8000-000000000001', 2097,
  'a8200000-0000-4000-8000-000000000002', (SELECT id FROM public.financial_accounts WHERE name = '金庫'), 'expense')$$,
  '42501', NULL, '副部長 cannot insert club transactions');
WITH changed AS (UPDATE public.transactions SET description = 'denied' WHERE id = 'a8700000-0000-4000-8000-000000000002' RETURNING id)
SELECT is((SELECT count(*) FROM changed), 0::bigint, '副部長 cannot edit own pending club row');
WITH changed AS (DELETE FROM public.transactions WHERE id = 'a8700000-0000-4000-8000-000000000002' RETURNING id)
SELECT is((SELECT count(*) FROM changed), 0::bigint, '副部長 cannot delete own pending club row');
WITH changed AS (UPDATE public.transactions SET approval_status = 'approved' WHERE id = 'a8700000-0000-4000-8000-000000000002' RETURNING id)
SELECT is((SELECT count(*) FROM changed), 0::bigint, '副部長 cannot approve own pending club row');
WITH changed AS (UPDATE public.transactions SET accounting_group_id = 'a8500000-0000-4000-8000-000000000002' WHERE id = 'a8700000-0000-4000-8000-000000000002' RETURNING id)
SELECT is((SELECT count(*) FROM changed), 0::bigint, '副部長 cannot move out own pending club row');
SELECT throws_ok($$UPDATE public.transactions SET accounting_group_id = 'a8500000-0000-4000-8000-000000000001' WHERE id = 'a8700000-0000-4000-8000-000000000004'$$, '42501', NULL, '副部長 cannot move own non-club row into club');
SELECT ok(public.is_restricted_api_writer(), '副部長 remains subject to the 20261022120000 guard');
SELECT throws_ok($$UPDATE public.transactions SET approval_status = 'approved' WHERE id = 'a8700000-0000-4000-8000-000000000004'$$, '42501', 'transactions: protected column changed', '副部長 protected-column guard still executes on own non-club row');
SELECT throws_ok($$SELECT public.create_transfer('2097-05-01', 100, (SELECT id FROM public.financial_accounts WHERE name = '金庫'), (SELECT id FROM public.financial_accounts WHERE name = '銀行口座'), 'Denied')$$, 'P0001', 'Insufficient privileges to create a transfer', '副部長 cannot create transfers');
WITH changed AS (UPDATE public.financial_accounts SET name = 'Denied' WHERE name = '金庫' RETURNING id)
SELECT is((SELECT count(*) FROM changed), 0::bigint, '副部長 cannot edit wallets');

SELECT set_config('request.jwt.claims',
  '{"sub":"a8300000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT ok(NOT public.can_view_club_ledger(), 'general member has no club permission');
SELECT is((SELECT count(*) FROM public.transactions WHERE accounting_group_id = 'a8500000-0000-4000-8000-000000000001'), 0::bigint, 'general member cannot read club transactions');
SELECT is((SELECT count(*) FROM public.v_ledger_transactions WHERE accounting_group_id = 'a8500000-0000-4000-8000-000000000001'), 0::bigint, 'general member cannot read club v_ledger_transactions');

SELECT * FROM finish();
ROLLBACK;
