BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users (id, email) VALUES
('a2510000-0000-4000-8000-000000000001', 'p2-0@example.test'),
('a2510000-0000-4000-8000-000000000002', 'p2-1@example.test'),
('a2510000-0000-4000-8000-000000000003', 'p2-2@example.test'),
('a2510000-0000-4000-8000-000000000004', 'p2-3@example.test'),
('a2510000-0000-4000-8000-000000000005', 'p2-4@example.test'),
('a2510000-0000-4000-8000-000000000006', 'p2-5@example.test');
INSERT INTO public.profiles (id, name, student_number, grade) VALUES
('a2510000-0000-4000-8000-000000000001', 'P2 member', '9980001', 1),
('a2510000-0000-4000-8000-000000000002', 'P2 leader', '9980002', 1),
('a2510000-0000-4000-8000-000000000003', '会計', '9980003', 1),
('a2510000-0000-4000-8000-000000000004', 'P2 admin', '9980004', 1),
('a2510000-0000-4000-8000-000000000005', '部長', '9980005', 1),
('a2510000-0000-4000-8000-000000000006', '副部長', '9980006', 1) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.roles (id, name, type) VALUES
('a2520000-0000-4000-8000-000000000001', 'P2 member', 'general'),
('a2520000-0000-4000-8000-000000000002', 'P2 leader', 'leader'),
('a2520000-0000-4000-8000-000000000003', '会計', 'accounting'),
('a2520000-0000-4000-8000-000000000004', 'P2 admin', 'admin'),
('a2520000-0000-4000-8000-000000000005', '部長', 'general'),
('a2520000-0000-4000-8000-000000000006', '副部長', 'general');
INSERT INTO public.user_roles (user_id, role_id) VALUES
('a2510000-0000-4000-8000-000000000001', 'a2520000-0000-4000-8000-000000000001'),
('a2510000-0000-4000-8000-000000000002', 'a2520000-0000-4000-8000-000000000002'),
('a2510000-0000-4000-8000-000000000003', 'a2520000-0000-4000-8000-000000000003'),
('a2510000-0000-4000-8000-000000000004', 'a2520000-0000-4000-8000-000000000004'),
('a2510000-0000-4000-8000-000000000005', 'a2520000-0000-4000-8000-000000000005'),
('a2510000-0000-4000-8000-000000000006', 'a2520000-0000-4000-8000-000000000006');
SELECT plan(17);
INSERT INTO public.fiscal_years (year, start_date, end_date) VALUES (2097, '2097-04-01', '2098-03-31') ON CONFLICT (year) DO NOTHING;
INSERT INTO public.financial_accounts (id, name, type) VALUES ('a2530000-0000-4000-8000-000000000001','P2 cash','cash'), ('a2530000-0000-4000-8000-000000000002','P2 bank','bank');
INSERT INTO public.transactions (id, date, amount, description, accounting_group_id, fiscal_year_id, created_by, approval_status, financial_account_id, transaction_kind)
SELECT 'a2540000-0000-4000-8000-000000000001', '2097-05-01', -100, 'P2 own expense', id, 2097, 'a2510000-0000-4000-8000-000000000003', 'pending', 'a2530000-0000-4000-8000-000000000001', 'expense'
FROM public.accounting_groups WHERE type = 'club' LIMIT 1;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a2510000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT lives_ok($$SELECT public.create_transfer('2097-05-01', 700, 'a2530000-0000-4000-8000-000000000001', 'a2530000-0000-4000-8000-000000000002', 'P2 transfer 2', NULL, NULL, 'a2510000-0000-4000-8000-000000000001')$$, '会計 creates a transfer');
SELECT is((SELECT count(*) FROM public.transactions WHERE description = 'P2 transfer 2'), 2::bigint, 'exactly two legs');
SELECT ok((SELECT count(DISTINCT transfer_id) = 1 AND count(transfer_id) = 2 AND sum(amount) = 0
  AND min(amount) = -700 AND max(amount) = 700
  AND bool_and(transaction_kind = 'transfer' AND approval_status = 'approved'
    AND created_by = 'a2510000-0000-4000-8000-000000000003' AND approved_by = 'a2510000-0000-4000-8000-000000000003' AND approved_at IS NOT NULL
    AND fiscal_year_id = 2097
    AND accounting_group_id IN (SELECT id FROM public.accounting_groups WHERE type = 'club')
    AND ((amount < 0 AND financial_account_id = 'a2530000-0000-4000-8000-000000000001') OR (amount > 0 AND financial_account_id = 'a2530000-0000-4000-8000-000000000002')))
  FROM public.transactions WHERE description = 'P2 transfer 2'), 'approved opposite club legs with authoritative actor and wallets');
SELECT is((SELECT count(*) FROM public.audit_logs WHERE action = 'INSERT' AND table_name = 'transactions'
  AND new_data->>'description' = 'P2 transfer 2' AND changed_by = 'a2510000-0000-4000-8000-000000000003'), 2::bigint, 'both legs audited');
SELECT set_config('request.jwt.claims', '{"sub":"a2510000-0000-4000-8000-000000000004","role":"authenticated"}', true);
SELECT lives_ok($$SELECT public.create_transfer('2097-05-01', 700, 'a2530000-0000-4000-8000-000000000001', 'a2530000-0000-4000-8000-000000000002', 'P2 transfer 3', NULL, NULL, 'a2510000-0000-4000-8000-000000000001')$$, 'P2 admin creates a transfer');
SELECT is((SELECT count(*) FROM public.transactions WHERE description = 'P2 transfer 3'), 2::bigint, 'exactly two legs');
SELECT ok((SELECT count(DISTINCT transfer_id) = 1 AND count(transfer_id) = 2 AND sum(amount) = 0
  AND min(amount) = -700 AND max(amount) = 700
  AND bool_and(transaction_kind = 'transfer' AND approval_status = 'approved'
    AND created_by = 'a2510000-0000-4000-8000-000000000004' AND approved_by = 'a2510000-0000-4000-8000-000000000004' AND approved_at IS NOT NULL
    AND fiscal_year_id = 2097
    AND accounting_group_id IN (SELECT id FROM public.accounting_groups WHERE type = 'club')
    AND ((amount < 0 AND financial_account_id = 'a2530000-0000-4000-8000-000000000001') OR (amount > 0 AND financial_account_id = 'a2530000-0000-4000-8000-000000000002')))
  FROM public.transactions WHERE description = 'P2 transfer 3'), 'approved opposite club legs with authoritative actor and wallets');
SELECT is((SELECT count(*) FROM public.audit_logs WHERE action = 'INSERT' AND table_name = 'transactions'
  AND new_data->>'description' = 'P2 transfer 3' AND changed_by = 'a2510000-0000-4000-8000-000000000004'), 2::bigint, 'both legs audited');
SELECT set_config('request.jwt.claims', '{"sub":"a2510000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.create_transfer('2097-05-01', 700, 'a2530000-0000-4000-8000-000000000001', 'a2530000-0000-4000-8000-000000000002', 'P2 invalid', NULL, NULL, 'a2510000-0000-4000-8000-000000000001')$$, 'P0001', 'Insufficient privileges to create a transfer', 'P2 member rejected');
SELECT set_config('request.jwt.claims', '{"sub":"a2510000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.create_transfer('2097-05-01', 700, 'a2530000-0000-4000-8000-000000000001', 'a2530000-0000-4000-8000-000000000002', 'P2 invalid', NULL, NULL, 'a2510000-0000-4000-8000-000000000001')$$, 'P0001', 'Insufficient privileges to create a transfer', 'P2 leader rejected');
SELECT set_config('request.jwt.claims', '{"sub":"a2510000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.create_transfer('2097-05-01', 700, 'a2530000-0000-4000-8000-000000000001', 'a2530000-0000-4000-8000-000000000001', 'P2 invalid', NULL, NULL, 'a2510000-0000-4000-8000-000000000001')$$, 'P0001', 'Source and destination accounts must be different', 'invalid transfer rejected');
SELECT throws_ok($$SELECT public.create_transfer('2097-05-01', 0, 'a2530000-0000-4000-8000-000000000001', 'a2530000-0000-4000-8000-000000000002', 'P2 invalid', NULL, NULL, 'a2510000-0000-4000-8000-000000000001')$$, 'P0001', 'Transfer amount must be positive', 'invalid transfer rejected');
SELECT throws_ok($$SELECT public.create_transfer('2097-05-01', -1, 'a2530000-0000-4000-8000-000000000001', 'a2530000-0000-4000-8000-000000000002', 'P2 invalid', NULL, NULL, 'a2510000-0000-4000-8000-000000000001')$$, 'P0001', 'Transfer amount must be positive', 'invalid transfer rejected');
SELECT throws_ok($$UPDATE public.transactions SET approval_status = 'approved'
  WHERE id = 'a2540000-0000-4000-8000-000000000001'$$, '42501', NULL, 'ordinary self-approval remains blocked');
SELECT is((SELECT approval_status::text FROM public.transactions WHERE id = 'a2540000-0000-4000-8000-000000000001'), 'pending', 'ordinary expense stays pending');
SELECT is((SELECT count(*) FROM public.transactions WHERE description = 'P2 invalid'), 0::bigint, 'rejections leave no half transfer');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok($$SELECT public.create_transfer('2097-05-01', 700, 'a2530000-0000-4000-8000-000000000001', 'a2530000-0000-4000-8000-000000000002', 'P2 invalid', NULL, NULL, 'a2510000-0000-4000-8000-000000000001')$$, '42501', NULL, 'anon has no RPC execution grant');
SELECT * FROM finish();
ROLLBACK;
