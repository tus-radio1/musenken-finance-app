-- pgTAP: who may write which transactions / subsidy items through the Data API.
-- Plan: .claude/docs/plans/p1-typed-permissions.md (§2.4-§2.6, steps 3/10/11/12).
-- Assertions inside todo_start/todo_end document known bugs that PR-B
-- (steps 11 and 12) fixes; each fixing step moves its block out of todo.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner, RLS not applied)
-- ---------------------------------------------------------------------------
-- Users: member (role in G1), leader (leader of G1), accountant (会計),
-- admin, outsider (role in G2 only).
INSERT INTO auth.users (id, email) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'tw-member@example.test'),
  ('b2000000-0000-4000-8000-000000000002', 'tw-leader@example.test'),
  ('b3000000-0000-4000-8000-000000000003', 'tw-accountant@example.test'),
  ('b4000000-0000-4000-8000-000000000004', 'tw-admin@example.test'),
  ('b5000000-0000-4000-8000-000000000005', 'tw-outsider@example.test');

INSERT INTO public.profiles (id, name, student_number, grade) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'Member', '9998001', 1),
  ('b2000000-0000-4000-8000-000000000002', 'Leader', '9998002', 1),
  ('b3000000-0000-4000-8000-000000000003', 'Accountant', '9998003', 1),
  ('b4000000-0000-4000-8000-000000000004', 'Admin', '9998004', 1),
  ('b5000000-0000-4000-8000-000000000005', 'Outsider', '9998005', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_years (year, start_date, end_date)
VALUES (2098, '2098-04-01', '2099-03-31')
ON CONFLICT (year) DO NOTHING;

-- G1 / G2 / G3 are restricted (type 'leader') groups.
INSERT INTO public.accounting_groups (id, name, type) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'pgtap tw G1', 'leader'),
  ('e2000000-0000-4000-8000-000000000002', 'pgtap tw G2', 'leader'),
  ('e3000000-0000-4000-8000-000000000003', 'pgtap tw G3', 'leader');

INSERT INTO public.roles (id, name, type, accounting_group_id) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'pgtap tw member G1', 'general', 'e1000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002', 'pgtap tw leader G1', 'leader', 'e1000000-0000-4000-8000-000000000001'),
  ('f3000000-0000-4000-8000-000000000003', '会計', 'accounting', NULL),
  ('f4000000-0000-4000-8000-000000000004', 'pgtap tw admin', 'admin', NULL),
  ('f5000000-0000-4000-8000-000000000005', 'pgtap tw member G2', 'general', 'e2000000-0000-4000-8000-000000000002');

INSERT INTO public.user_roles (user_id, role_id) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002'),
  ('b3000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000003'),
  ('b4000000-0000-4000-8000-000000000004', 'f4000000-0000-4000-8000-000000000004'),
  ('b5000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000005');

-- Pending transactions in G1:
--   t1 member's (leader approval), t2 member's (会計 approval),
--   t3 member's (destination move), t4 accountant's own, t5 admin's own.
INSERT INTO public.transactions (
  id, date, amount, description, accounting_group_id, fiscal_year_id,
  approval_status, created_by, financial_account_id, transaction_kind
)
SELECT v.id::uuid, '2098-05-01', -1000, v.description,
  'e1000000-0000-4000-8000-000000000001', 2098, 'pending', v.created_by::uuid,
  (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
  'expense'
FROM (VALUES
  ('d1000000-0000-4000-8000-000000000001', 't1', 'b1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000002', 't2', 'b1000000-0000-4000-8000-000000000001'),
  ('d3000000-0000-4000-8000-000000000003', 't3', 'b1000000-0000-4000-8000-000000000001'),
  ('d4000000-0000-4000-8000-000000000004', 't4', 'b3000000-0000-4000-8000-000000000003'),
  ('d5000000-0000-4000-8000-000000000005', 't5', 'b4000000-0000-4000-8000-000000000004')
) AS v(id, description, created_by);

-- Subsidy items owned by the member: c1 pending, c2 approved.
INSERT INTO public.subsidy_items (
  id, category, term, expense_type, accounting_group_id, applicant_id,
  fiscal_year_id, name, requested_amount, justification, status
) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'activity', 1, 'equipment',
   'e1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   2098, 'Own pending item', 1000, 'reason', 'pending'),
  ('c2000000-0000-4000-8000-000000000002', 'activity', 1, 'equipment',
   'e1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   2098, 'Own approved item', 1000, 'reason', 'approved');

-- ---------------------------------------------------------------------------
-- Approval (D1: admin + 会計 only; leaders have no UPDATE policy)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT lives_ok(
  $$UPDATE public.transactions
    SET approval_status = 'approved',
        approved_by = 'b2000000-0000-4000-8000-000000000002', approved_at = now()
    WHERE id = 'd1000000-0000-4000-8000-000000000001'$$,
  'leader approval statement runs (RLS filters it, no error)'
);

SELECT set_config('request.jwt.claims',
  '{"sub":"b3000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT lives_ok(
  $$UPDATE public.transactions
    SET approval_status = 'approved',
        approved_by = 'b3000000-0000-4000-8000-000000000003', approved_at = now()
    WHERE id = 'd2000000-0000-4000-8000-000000000002'$$,
  '会計 can approve a member''s pending transaction'
);

-- Admin self-row correction is the break-glass path (user decision); the
-- step 11 guard must keep it working.
SELECT set_config('request.jwt.claims',
  '{"sub":"b4000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
SELECT lives_ok(
  $$UPDATE public.transactions SET approval_status = 'approved'
    WHERE id = 'd5000000-0000-4000-8000-000000000005'$$,
  'admin can change the approval status of their own row'
);

RESET ROLE;
SELECT is(
  (SELECT approval_status::text FROM public.transactions
    WHERE id = 'd1000000-0000-4000-8000-000000000001'),
  'pending',
  'leader approval changed nothing (the app must report this as an error)'
);
SELECT is(
  (SELECT approval_status::text FROM public.transactions
    WHERE id = 'd2000000-0000-4000-8000-000000000002'),
  'approved',
  'the 会計 approval was persisted'
);
SELECT is(
  (SELECT approval_status::text FROM public.transactions
    WHERE id = 'd5000000-0000-4000-8000-000000000005'),
  'approved',
  'the admin self-row correction was persisted'
);

-- ---------------------------------------------------------------------------
-- Owner delete of subsidy items (step 10, policy subsidy_items_delete_own_pending)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT lives_ok(
  $$DELETE FROM public.subsidy_items
    WHERE id = 'c1000000-0000-4000-8000-000000000001'$$,
  'another user''s delete statement runs (RLS filters it)'
);
SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT lives_ok(
  $$DELETE FROM public.subsidy_items
    WHERE id = 'c2000000-0000-4000-8000-000000000002'$$,
  'owner delete of own approved subsidy item runs (RLS filters it)'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.subsidy_items
    WHERE id IN ('c1000000-0000-4000-8000-000000000001',
                 'c2000000-0000-4000-8000-000000000002')),
  2::bigint,
  'neither another user nor the owner of a non-pending item deleted anything'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT lives_ok(
  $$DELETE FROM public.subsidy_items
    WHERE id = 'c1000000-0000-4000-8000-000000000001'$$,
  'owner delete of own pending subsidy item runs'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.subsidy_items
    WHERE id = 'c1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'owner can delete own pending subsidy item'
);

-- ---------------------------------------------------------------------------
-- Known bugs fixed in PR-B (steps 11 and 12)
-- ---------------------------------------------------------------------------

-- Step 11 (PR-B): 会計 approves own transaction through the Data API.
SELECT todo_start('step 11: no DB guard against 会計 self-approval');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b3000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT throws_ok(
  $$UPDATE public.transactions SET approval_status = 'approved'
    WHERE id = 'd4000000-0000-4000-8000-000000000004'$$,
  '42501', NULL, '会計 cannot approve their own transaction'
);
RESET ROLE;
SELECT is(
  (SELECT approval_status::text FROM public.transactions
    WHERE id = 'd4000000-0000-4000-8000-000000000004'),
  'pending',
  '会計 own transaction stays pending'
);
SELECT todo_end();

-- Step 12 (PR-B): group checks on INSERT (tautology) and destination moves.
SELECT todo_start('step 12: transactions_insert_member group check is a tautology');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b5000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SELECT throws_ok(
  $$INSERT INTO public.transactions (
      id, date, amount, description, accounting_group_id, fiscal_year_id,
      approval_status, created_by, financial_account_id, transaction_kind
    ) VALUES (
      'd6000000-0000-4000-8000-000000000006', '2098-05-01', -1, 'outsider',
      'e1000000-0000-4000-8000-000000000001', 2098, 'pending',
      'b5000000-0000-4000-8000-000000000005',
      (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
      'expense'
    )$$,
  '42501', NULL, 'a user with a role only in G2 cannot insert into G1'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.transactions
    WHERE id = 'd6000000-0000-4000-8000-000000000006'),
  0::bigint,
  'no outsider row was inserted into G1'
);
SELECT todo_end();

SELECT todo_start('step 12: no destination check on accounting_group_id changes');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT throws_ok(
  $$UPDATE public.transactions
    SET accounting_group_id = 'e3000000-0000-4000-8000-000000000003'
    WHERE id = 'd3000000-0000-4000-8000-000000000003'$$,
  '42501', NULL, 'member cannot move own pending transaction to an unrelated group'
);
RESET ROLE;
SELECT is(
  (SELECT accounting_group_id::text FROM public.transactions
    WHERE id = 'd3000000-0000-4000-8000-000000000003'),
  'e1000000-0000-4000-8000-000000000001',
  'the transaction stays in G1'
);
SELECT todo_end();

SELECT * FROM finish();
ROLLBACK;
