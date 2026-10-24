-- Production-shaped accounting fixture: execute the actual role-data migration
-- inside this transaction, not a copy of its UPDATE. All fixtures roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(47);
SELECT is((SELECT cardinality(statements) FROM supabase_migrations.schema_migrations
  WHERE version = '20261023110000'), 1, 'actual Migration B is available in local migration history');

INSERT INTO auth.users (id, email) VALUES
  ('a9100000-0000-4000-8000-000000000001', 'split-accountant@example.test'),
  ('a9100000-0000-4000-8000-000000000002', 'split-dual@example.test'),
  ('a9100000-0000-4000-8000-000000000003', 'split-member@example.test');
INSERT INTO public.profiles (id, name, student_number, grade) VALUES
  ('a9100000-0000-4000-8000-000000000001', 'Split Accountant', '9999101', 1),
  ('a9100000-0000-4000-8000-000000000002', 'Split Dual', '9999102', 1),
  ('a9100000-0000-4000-8000-000000000003', 'Split Member', '9999103', 1);
INSERT INTO public.accounting_groups (id, name, type) VALUES
  ('a9200000-0000-4000-8000-000000000001', 'split ordinary', 'general');
INSERT INTO public.roles (id, name, type, accounting_group_id) VALUES
  ('a9300000-0000-4000-8000-000000000001', '会計', 'admin', NULL),
  ('a9300000-0000-4000-8000-000000000002', 'Admin', 'admin', NULL),
  ('a9300000-0000-4000-8000-000000000003', '会計', 'admin', 'a9200000-0000-4000-8000-000000000001'),
  ('a9300000-0000-4000-8000-000000000004', '会計', 'accounting', NULL);
INSERT INTO public.user_roles (user_id, role_id) VALUES
  ('a9100000-0000-4000-8000-000000000001', 'a9300000-0000-4000-8000-000000000001'),
  ('a9100000-0000-4000-8000-000000000002', 'a9300000-0000-4000-8000-000000000001'),
  ('a9100000-0000-4000-8000-000000000002', 'a9300000-0000-4000-8000-000000000002');

SELECT ok(NOT has_function_privilege('anon', 'public.soft_delete_subsidy_item(uuid)', 'EXECUTE'),
  'anonymous callers cannot execute soft-delete RPC');

SELECT is((SELECT data_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'type'),
  'text', 'roles.type is text, not an enum');
SELECT is((SELECT count(*) FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'public.roles'::regclass AND c.contype = 'c' AND a.attname = 'type'),
  0::bigint, 'no CHECK constraint rejects accounting');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a9100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT ok(public.is_admin(), 'production-shaped accounting user is admin before B');
RESET ROLE;
-- The CLI mounts tests, not migration files, into the DB container. Replay
-- the exact SQL recorded by db reset instead of duplicating the UPDATE here.
SELECT unnest(statements) FROM supabase_migrations.schema_migrations
WHERE version = '20261023110000'
\gexec
SET LOCAL ROLE authenticated;
SELECT ok(NOT public.is_admin(), 'accounting-only user is no longer admin after actual B');
SELECT ok(public.has_role('会計'), 'accounting role assignment survives B');
SELECT ok(public.is_accounting_or_admin(), 'accounting helper still recognizes user');
SELECT set_config('request.jwt.claims',
  '{"sub":"a9100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT ok(public.is_admin(), 'Admin plus accounting retains global admin after B');
RESET ROLE;
-- The CLI mounts tests, not migration files, into the DB container. Replay
-- the exact SQL recorded by db reset instead of duplicating the UPDATE here.
SELECT unnest(statements) FROM supabase_migrations.schema_migrations
WHERE version = '20261023110000'
\gexec
SELECT is((SELECT type FROM public.roles WHERE id = 'a9300000-0000-4000-8000-000000000001'),
  'accounting', 'B remains idempotent');
SELECT is((SELECT type FROM public.roles WHERE id = 'a9300000-0000-4000-8000-000000000002'),
  'admin', 'B leaves Admin unchanged');
SELECT is((SELECT type FROM public.roles WHERE id = 'a9300000-0000-4000-8000-000000000003'),
  'admin', 'B leaves group-specific role unchanged');
SELECT is((SELECT type FROM public.roles WHERE id = 'a9300000-0000-4000-8000-000000000004'),
  'accounting', 'B is a no-op for already-correct local/staging data');

INSERT INTO public.fiscal_years (year, start_date, end_date, is_current) VALUES
  (2094, '2094-04-01', '2095-03-31', false);
INSERT INTO public.budgets (accounting_group_id, fiscal_year_id, amount) VALUES
  ('a9200000-0000-4000-8000-000000000001', 2094, 12345);
INSERT INTO public.financial_accounts (id, name, type) VALUES
  ('a9400000-0000-4000-8000-000000000001', 'split wallet', 'cash');
INSERT INTO public.transactions (
  id, date, amount, description, accounting_group_id, fiscal_year_id,
  approval_status, created_by, financial_account_id, transaction_kind
)
SELECT v.id::uuid, '2094-05-01', -100, 'split delete',
  COALESCE(v.group_id::uuid, 'a9200000-0000-4000-8000-000000000001'::uuid), 2094,
  v.status::public.approval_status, 'a9100000-0000-4000-8000-000000000003',
  'a9400000-0000-4000-8000-000000000001', 'expense'
FROM (VALUES
  ('a9500000-0000-4000-8000-000000000001', 'pending', NULL),
  ('a9500000-0000-4000-8000-000000000002', 'approved', NULL),
  ('a9500000-0000-4000-8000-000000000003', 'approved',
    (SELECT id::text FROM public.accounting_groups WHERE type = 'club' LIMIT 1))
) AS v(id, status, group_id);
INSERT INTO public.subsidy_items (
  id, category, term, expense_type, accounting_group_id, applicant_id,
  fiscal_year_id, name, requested_amount, justification, status
) VALUES
  ('a9600000-0000-4000-8000-000000000001', 'activity', 1, 'equipment',
   'a9200000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000003',
   2094, 'split soft delete', 100, 'reason', 'approved'),
  ('a9600000-0000-4000-8000-000000000002', 'activity', 1, 'equipment',
   'a9200000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000003',
   2094, 'split hard delete denied', 100, 'reason', 'approved');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a9100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT amount FROM public.budgets WHERE fiscal_year_id = 2094
  AND accounting_group_id = 'a9200000-0000-4000-8000-000000000001'),
  12345, 'non-admin accounting reads past-year budgets');
-- PR-B closes the documented app/DB availability gap: a global-only
-- accountant can now file into non-club groups, matching the deployed app.
SELECT lives_ok($$INSERT INTO public.transactions (
  date, amount, description, accounting_group_id, fiscal_year_id,
  created_by, financial_account_id, transaction_kind
) VALUES ('2094-05-01', -1, 'split global-only non-club insert',
  'a9200000-0000-4000-8000-000000000001', 2094,
  'a9100000-0000-4000-8000-000000000001',
  'a9400000-0000-4000-8000-000000000001', 'expense')$$,
  'global-only accounting can file into non-club groups after PR-B');
SELECT is((SELECT count(*) FROM public.transactions
  WHERE description = 'split global-only non-club insert'), 1::bigint,
  'global-only accounting INSERT persisted');
SELECT lives_ok($$DELETE FROM public.transactions WHERE id IN (
  'a9500000-0000-4000-8000-000000000001', 'a9500000-0000-4000-8000-000000000002',
  'a9500000-0000-4000-8000-000000000003')$$,
  'accounting deletes other members pending and approved transactions, including club');
-- The narrow RPC returns an ID without exposing deleted rows through RLS.
SELECT is(public.soft_delete_subsidy_item('a9600000-0000-4000-8000-000000000001'),
  'a9600000-0000-4000-8000-000000000001'::uuid,
  'accounting soft-deletes another member approved subsidy');
SELECT is(public.soft_delete_subsidy_item('a9600000-0000-4000-8000-000000000001'),
  NULL::uuid, 'repeated soft delete reports no affected row');
SELECT is(public.soft_delete_subsidy_item('a9600000-0000-4000-8000-000000000099'),
  NULL::uuid, 'missing subsidy reports no affected row');
SELECT is((SELECT count(*) FROM public.subsidy_items
  WHERE id = 'a9600000-0000-4000-8000-000000000001'),
  0::bigint, 'accounting cannot read the deleted subsidy');
UPDATE public.subsidy_items SET deleted_at = NULL
  WHERE id = 'a9600000-0000-4000-8000-000000000001';
DELETE FROM public.subsidy_items WHERE id = 'a9600000-0000-4000-8000-000000000002';
SELECT lives_ok($$INSERT INTO public.accounting_groups (id, name, type)
  VALUES ('a9200000-0000-4000-8000-000000000002', 'split created group', 'general')$$,
  'accounting creates a group');
SELECT lives_ok($$UPDATE public.accounting_groups SET is_active = false
  WHERE id = 'a9200000-0000-4000-8000-000000000002'$$,
  'accounting deactivates a group');
DELETE FROM public.accounting_groups WHERE id = 'a9200000-0000-4000-8000-000000000002';
SELECT lives_ok($$INSERT INTO public.fiscal_years (year, start_date, end_date)
  VALUES (2095, '2095-04-01', '2096-03-31')$$, 'accounting creates a fiscal year');
SELECT throws_ok($$INSERT INTO public.financial_accounts (name, type)
  VALUES ('split forbidden wallet', 'bank')$$, '42501', NULL,
  'accounting cannot insert wallet master');
UPDATE public.financial_accounts SET name = 'split forbidden rename'
  WHERE id = 'a9400000-0000-4000-8000-000000000001';
DELETE FROM public.financial_accounts WHERE id = 'a9400000-0000-4000-8000-000000000001';
UPDATE public.budgets SET amount = 1 WHERE fiscal_year_id = 2094
  AND accounting_group_id = 'a9200000-0000-4000-8000-000000000001';
DELETE FROM public.budgets WHERE fiscal_year_id = 2094
  AND accounting_group_id = 'a9200000-0000-4000-8000-000000000001';
SELECT throws_ok($$INSERT INTO public.user_roles (user_id, role_id) VALUES
  ('a9100000-0000-4000-8000-000000000001', 'a9300000-0000-4000-8000-000000000002')$$,
  '42501', NULL, 'accounting cannot appoint itself Admin');
UPDATE public.roles SET type = 'admin'
  WHERE id = 'a9300000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT is((SELECT count(*) FROM public.transactions WHERE id IN (
  'a9500000-0000-4000-8000-000000000001', 'a9500000-0000-4000-8000-000000000002',
  'a9500000-0000-4000-8000-000000000003')), 0::bigint, 'all three deletions persisted');
SELECT ok((SELECT deleted_at IS NOT NULL FROM public.subsidy_items
  WHERE id = 'a9600000-0000-4000-8000-000000000001'), 'soft delete persisted and restore was denied');
SELECT is((SELECT count(*) FROM public.subsidy_items
  WHERE id = 'a9600000-0000-4000-8000-000000000002'), 1::bigint, 'subsidy hard delete denied');
SELECT is((SELECT is_active FROM public.accounting_groups
  WHERE id = 'a9200000-0000-4000-8000-000000000002'), false, 'group update persisted and physical delete denied');
SELECT is((SELECT count(*) FROM public.fiscal_years WHERE year = 2095), 1::bigint,
  'fiscal year creation persisted');
SELECT is((SELECT name FROM public.financial_accounts
  WHERE id = 'a9400000-0000-4000-8000-000000000001'), 'split wallet', 'wallet UPDATE and DELETE denied');
SELECT is((SELECT amount FROM public.budgets WHERE fiscal_year_id = 2094
  AND accounting_group_id = 'a9200000-0000-4000-8000-000000000001'),
  12345, 'past-year budget UPDATE and DELETE denied');
SELECT is((SELECT type FROM public.roles WHERE id = 'a9300000-0000-4000-8000-000000000001'),
  'accounting', 'role escalation denied');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a9100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT throws_ok($$INSERT INTO public.accounting_groups (name) VALUES ('split member group')$$,
  '42501', NULL, 'ordinary member cannot create groups');
SELECT throws_ok($$INSERT INTO public.fiscal_years (year, start_date, end_date)
  VALUES (2096, '2096-04-01', '2097-03-31')$$,
  '42501', NULL, 'ordinary member cannot create fiscal years');
UPDATE public.accounting_groups SET is_active = true
  WHERE id = 'a9200000-0000-4000-8000-000000000002';
SELECT ok(public.is_restricted_api_writer(), 'member remains subject to protected-column guards');
SELECT throws_ok($$SELECT public.soft_delete_subsidy_item('a9600000-0000-4000-8000-000000000002')$$,
  '42501', NULL, 'member cannot use soft-delete RPC');
UPDATE public.subsidy_items SET deleted_at = now()
  WHERE id = 'a9600000-0000-4000-8000-000000000002';
RESET ROLE;
SELECT is((SELECT is_active FROM public.accounting_groups
  WHERE id = 'a9200000-0000-4000-8000-000000000002'), false, 'member cannot update groups');
SELECT ok((SELECT deleted_at IS NULL FROM public.subsidy_items
  WHERE id = 'a9600000-0000-4000-8000-000000000002'), 'member soft delete of approved item denied');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a9100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT is(public.soft_delete_subsidy_item('a9600000-0000-4000-8000-000000000002'),
  'a9600000-0000-4000-8000-000000000002'::uuid, 'Admin plus accounting can use soft-delete RPC');
SELECT lives_ok($$INSERT INTO public.financial_accounts (name, type)
  VALUES ('split dual wallet', 'bank')$$, 'Admin plus accounting still creates wallets');
SELECT lives_ok($$UPDATE public.financial_accounts SET name = 'split dual renamed'
  WHERE name = 'split dual wallet'$$, 'Admin plus accounting still edits wallets');
SELECT is((SELECT count(*) FROM public.financial_accounts WHERE name = 'split dual renamed'),
  1::bigint, 'dual-role wallet changes persisted');
SELECT lives_ok($$DELETE FROM public.financial_accounts WHERE name = 'split dual renamed'$$,
  'Admin plus accounting still deletes wallets');
SELECT is((SELECT count(*) FROM public.financial_accounts WHERE name = 'split dual renamed'),
  0::bigint, 'dual-role wallet deletion persisted');
RESET ROLE;

SELECT is((SELECT count(*) FROM pg_trigger WHERE tgrelid IN (
  'public.transactions'::regclass, 'public.subsidy_items'::regclass)
  AND tgname IN ('guard_transactions_write', 'guard_subsidy_items_write')),
  2::bigint, 'both protected-column guard triggers remain installed');
SELECT * FROM finish();
ROLLBACK;
