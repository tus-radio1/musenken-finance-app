-- PR-B: actual INSERT / changed-group UPDATE matrix and approval regressions.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(194);

-- Stable fixture IDs without depending on seeded user/role assignments.
CREATE TEMP TABLE guard_actors AS
SELECT key, md5('prb actor ' || key)::uuid AS id, role_name, role_type,
  group_key, full_access
FROM (VALUES
  ('member', 'prb member', 'general', 'team', false),
  ('leader', 'prb leader', 'leader', 'team', false),
  ('accountant', '会計', 'accounting', NULL, true),
  ('chair', '部長', 'general', NULL, true),
  ('vice', '副部長', 'general', NULL, true),
  ('admin', 'prb admin', 'admin', NULL, true),
  ('roleless', NULL, NULL, NULL, false)
) v(key, role_name, role_type, group_key, full_access);
CREATE TEMP TABLE guard_groups AS
SELECT key, md5('prb group ' || key)::uuid AS id, type
FROM (VALUES ('open', 'general'), ('null', NULL), ('team', 'team'),
  ('other', 'team'), ('club', 'club'), ('unknown', 'custom')) v(key, type);

INSERT INTO auth.users (id, email)
SELECT id, 'prb-' || key || '@example.test' FROM guard_actors;
INSERT INTO public.profiles (id, name, student_number, grade)
SELECT id, key, '9987' || row_number() OVER (ORDER BY key), 1 FROM guard_actors
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fiscal_years (year, start_date, end_date)
VALUES (2098, '2098-04-01', '2099-03-31') ON CONFLICT (year) DO NOTHING;
INSERT INTO public.accounting_groups (id, name, type, is_active)
SELECT id, 'prb ' || key, type, key <> 'other' FROM guard_groups;
INSERT INTO public.roles (id, name, type, accounting_group_id)
SELECT md5('prb role ' || a.key)::uuid, a.role_name, a.role_type, g.id
FROM guard_actors a LEFT JOIN guard_groups g ON g.key = a.group_key
WHERE a.role_name IS NOT NULL;
INSERT INTO public.user_roles (user_id, role_id)
SELECT id, md5('prb role ' || key)::uuid FROM guard_actors WHERE role_name IS NOT NULL;

CREATE TEMP TABLE guard_cases AS
SELECT a.key AS actor, a.id AS actor_id, g.key AS target, g.id AS group_id,
  md5('prb insert ' || a.key || g.key)::uuid AS insert_id,
  md5('prb move ' || a.key || g.key)::uuid AS move_id,
  CASE WHEN g.type = 'club' THEN a.key IN ('accountant', 'admin')
    ELSE a.full_access OR g.type = 'general' OR g.type IS NULL
      OR COALESCE(a.group_key = g.key, false) END AS allowed
FROM guard_actors a CROSS JOIN guard_groups g;
GRANT SELECT ON guard_actors, guard_groups, guard_cases TO authenticated;

-- Every move starts in an open group. Historical outsider row starts in an
-- unrelated inactive team, and historical self-approval is left untouched.
INSERT INTO public.transactions (
  id, date, amount, description, accounting_group_id, fiscal_year_id,
  approval_status, created_by, financial_account_id, transaction_kind
)
SELECT move_id, '2098-05-01', -1, 'move fixture',
  (SELECT id FROM guard_groups WHERE key = 'open'), 2098, 'pending', actor_id,
  (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1), 'expense'
FROM guard_cases;
INSERT INTO public.transactions (
  id, date, amount, description, accounting_group_id, fiscal_year_id,
  approval_status, created_by, approved_by, financial_account_id, transaction_kind
)
SELECT md5('prb tx ' || v.key)::uuid, '2098-05-01', -1, v.key,
  (SELECT id FROM guard_groups WHERE key = 'other'), 2098,
  v.status::public.approval_status, a.id,
  CASE WHEN v.status = 'approved' THEN a.id END,
  (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1), 'expense'
FROM (VALUES ('self', 'accountant', 'pending'), ('other', 'member', 'pending'),
  ('legacy', 'member', 'pending'), ('historical', 'accountant', 'approved'))
  v(key, actor, status) JOIN guard_actors a ON a.key = v.actor;

-- 7 actors x 6 destination groups x 2 operations x statement + state = 168.
-- Each actor uses the same set of actual SQL statements under authenticated.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', id,
  'role', 'authenticated')::text, true) FROM guard_actors WHERE key = 'member';
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format($q$INSERT INTO public.transactions (
    id, date, amount, description, accounting_group_id, fiscal_year_id,
    approval_status, created_by, financial_account_id, transaction_kind
  ) VALUES (%L, '2098-05-01', -1, 'insert matrix', %L, 2098, 'pending',
    auth.uid(), (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
    'expense')$q$, insert_id, group_id) AS stmt,
    actor || ' INSERT ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'member'
) c;
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format('UPDATE public.transactions SET accounting_group_id = %L WHERE id = %L',
    group_id, move_id) AS stmt,
    actor || ' MOVE ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'member'
) c;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.transactions t WHERE t.id = c.insert_id),
  CASE WHEN allowed THEN 1 ELSE 0 END::bigint, actor || ' INSERT persisted ' || target)
FROM guard_cases c WHERE actor = 'member';
SELECT is((SELECT accounting_group_id FROM public.transactions t WHERE t.id = c.move_id),
  CASE WHEN allowed THEN group_id ELSE (SELECT id FROM guard_groups WHERE key = 'open') END,
  actor || ' MOVE persisted ' || target)
FROM guard_cases c WHERE actor = 'member';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', id,
  'role', 'authenticated')::text, true) FROM guard_actors WHERE key = 'leader';
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format($q$INSERT INTO public.transactions (
    id, date, amount, description, accounting_group_id, fiscal_year_id,
    approval_status, created_by, financial_account_id, transaction_kind
  ) VALUES (%L, '2098-05-01', -1, 'insert matrix', %L, 2098, 'pending',
    auth.uid(), (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
    'expense')$q$, insert_id, group_id) AS stmt,
    actor || ' INSERT ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'leader'
) c;
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format('UPDATE public.transactions SET accounting_group_id = %L WHERE id = %L',
    group_id, move_id) AS stmt,
    actor || ' MOVE ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'leader'
) c;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.transactions t WHERE t.id = c.insert_id),
  CASE WHEN allowed THEN 1 ELSE 0 END::bigint, actor || ' INSERT persisted ' || target)
FROM guard_cases c WHERE actor = 'leader';
SELECT is((SELECT accounting_group_id FROM public.transactions t WHERE t.id = c.move_id),
  CASE WHEN allowed THEN group_id ELSE (SELECT id FROM guard_groups WHERE key = 'open') END,
  actor || ' MOVE persisted ' || target)
FROM guard_cases c WHERE actor = 'leader';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', id,
  'role', 'authenticated')::text, true) FROM guard_actors WHERE key = 'accountant';
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format($q$INSERT INTO public.transactions (
    id, date, amount, description, accounting_group_id, fiscal_year_id,
    approval_status, created_by, financial_account_id, transaction_kind
  ) VALUES (%L, '2098-05-01', -1, 'insert matrix', %L, 2098, 'pending',
    auth.uid(), (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
    'expense')$q$, insert_id, group_id) AS stmt,
    actor || ' INSERT ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'accountant'
) c;
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format('UPDATE public.transactions SET accounting_group_id = %L WHERE id = %L',
    group_id, move_id) AS stmt,
    actor || ' MOVE ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'accountant'
) c;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.transactions t WHERE t.id = c.insert_id),
  CASE WHEN allowed THEN 1 ELSE 0 END::bigint, actor || ' INSERT persisted ' || target)
FROM guard_cases c WHERE actor = 'accountant';
SELECT is((SELECT accounting_group_id FROM public.transactions t WHERE t.id = c.move_id),
  CASE WHEN allowed THEN group_id ELSE (SELECT id FROM guard_groups WHERE key = 'open') END,
  actor || ' MOVE persisted ' || target)
FROM guard_cases c WHERE actor = 'accountant';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', id,
  'role', 'authenticated')::text, true) FROM guard_actors WHERE key = 'chair';
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format($q$INSERT INTO public.transactions (
    id, date, amount, description, accounting_group_id, fiscal_year_id,
    approval_status, created_by, financial_account_id, transaction_kind
  ) VALUES (%L, '2098-05-01', -1, 'insert matrix', %L, 2098, 'pending',
    auth.uid(), (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
    'expense')$q$, insert_id, group_id) AS stmt,
    actor || ' INSERT ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'chair'
) c;
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format('UPDATE public.transactions SET accounting_group_id = %L WHERE id = %L',
    group_id, move_id) AS stmt,
    actor || ' MOVE ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'chair'
) c;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.transactions t WHERE t.id = c.insert_id),
  CASE WHEN allowed THEN 1 ELSE 0 END::bigint, actor || ' INSERT persisted ' || target)
FROM guard_cases c WHERE actor = 'chair';
SELECT is((SELECT accounting_group_id FROM public.transactions t WHERE t.id = c.move_id),
  CASE WHEN allowed THEN group_id ELSE (SELECT id FROM guard_groups WHERE key = 'open') END,
  actor || ' MOVE persisted ' || target)
FROM guard_cases c WHERE actor = 'chair';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', id,
  'role', 'authenticated')::text, true) FROM guard_actors WHERE key = 'vice';
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format($q$INSERT INTO public.transactions (
    id, date, amount, description, accounting_group_id, fiscal_year_id,
    approval_status, created_by, financial_account_id, transaction_kind
  ) VALUES (%L, '2098-05-01', -1, 'insert matrix', %L, 2098, 'pending',
    auth.uid(), (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
    'expense')$q$, insert_id, group_id) AS stmt,
    actor || ' INSERT ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'vice'
) c;
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format('UPDATE public.transactions SET accounting_group_id = %L WHERE id = %L',
    group_id, move_id) AS stmt,
    actor || ' MOVE ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'vice'
) c;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.transactions t WHERE t.id = c.insert_id),
  CASE WHEN allowed THEN 1 ELSE 0 END::bigint, actor || ' INSERT persisted ' || target)
FROM guard_cases c WHERE actor = 'vice';
SELECT is((SELECT accounting_group_id FROM public.transactions t WHERE t.id = c.move_id),
  CASE WHEN allowed THEN group_id ELSE (SELECT id FROM guard_groups WHERE key = 'open') END,
  actor || ' MOVE persisted ' || target)
FROM guard_cases c WHERE actor = 'vice';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', id,
  'role', 'authenticated')::text, true) FROM guard_actors WHERE key = 'admin';
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format($q$INSERT INTO public.transactions (
    id, date, amount, description, accounting_group_id, fiscal_year_id,
    approval_status, created_by, financial_account_id, transaction_kind
  ) VALUES (%L, '2098-05-01', -1, 'insert matrix', %L, 2098, 'pending',
    auth.uid(), (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
    'expense')$q$, insert_id, group_id) AS stmt,
    actor || ' INSERT ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'admin'
) c;
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format('UPDATE public.transactions SET accounting_group_id = %L WHERE id = %L',
    group_id, move_id) AS stmt,
    actor || ' MOVE ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'admin'
) c;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.transactions t WHERE t.id = c.insert_id),
  CASE WHEN allowed THEN 1 ELSE 0 END::bigint, actor || ' INSERT persisted ' || target)
FROM guard_cases c WHERE actor = 'admin';
SELECT is((SELECT accounting_group_id FROM public.transactions t WHERE t.id = c.move_id),
  CASE WHEN allowed THEN group_id ELSE (SELECT id FROM guard_groups WHERE key = 'open') END,
  actor || ' MOVE persisted ' || target)
FROM guard_cases c WHERE actor = 'admin';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', id,
  'role', 'authenticated')::text, true) FROM guard_actors WHERE key = 'roleless';
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format($q$INSERT INTO public.transactions (
    id, date, amount, description, accounting_group_id, fiscal_year_id,
    approval_status, created_by, financial_account_id, transaction_kind
  ) VALUES (%L, '2098-05-01', -1, 'insert matrix', %L, 2098, 'pending',
    auth.uid(), (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
    'expense')$q$, insert_id, group_id) AS stmt,
    actor || ' INSERT ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'roleless'
) c;
SELECT CASE WHEN allowed THEN lives_ok(stmt, label)
  ELSE throws_ok(stmt, '42501', NULL, label) END
FROM (
  SELECT allowed, format('UPDATE public.transactions SET accounting_group_id = %L WHERE id = %L',
    group_id, move_id) AS stmt,
    actor || ' MOVE ' || target || ' allowed=' || allowed AS label
  FROM guard_cases WHERE actor = 'roleless'
) c;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.transactions t WHERE t.id = c.insert_id),
  CASE WHEN allowed THEN 1 ELSE 0 END::bigint, actor || ' INSERT persisted ' || target)
FROM guard_cases c WHERE actor = 'roleless';
SELECT is((SELECT accounting_group_id FROM public.transactions t WHERE t.id = c.move_id),
  CASE WHEN allowed THEN group_id ELSE (SELECT id FROM guard_groups WHERE key = 'open') END,
  actor || ' MOVE persisted ' || target)
FROM guard_cases c WHERE actor = 'roleless';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', id,
  'role', 'authenticated')::text, true) FROM guard_actors WHERE key = 'accountant';
SELECT throws_ok(
  $$UPDATE public.transactions SET approval_status = 'rejected', approved_by = auth.uid()
    WHERE id = md5('prb tx self')::uuid$$,
  '42501', NULL, '会計 cannot reject their own row');
SELECT throws_ok(
  $$UPDATE public.transactions SET approved_by = auth.uid()
    WHERE id = md5('prb tx self')::uuid$$,
  '42501', NULL, '会計 cannot set approved_by on their own pending row');
SELECT throws_ok(
  $$UPDATE public.transactions SET approved_at = now(), rejected_reason = 'self'
    WHERE id = md5('prb tx self')::uuid$$,
  '42501', NULL, '会計 cannot change own approval metadata');
SELECT throws_ok(
  $$INSERT INTO public.transactions (date, amount, description, accounting_group_id,
    fiscal_year_id, approval_status, created_by, approved_by, financial_account_id, transaction_kind)
    SELECT '2098-05-01', -1, 'preapproved', id, 2098, 'approved', auth.uid(), auth.uid(),
      (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1), 'expense'
    FROM guard_groups WHERE key = 'open'$$,
  '42501', NULL, '会計 cannot insert a preapproved self row');
SELECT throws_ok(
  $$INSERT INTO public.transactions (date, amount, description, accounting_group_id,
    fiscal_year_id, approval_status, created_by, financial_account_id, transaction_kind)
    SELECT '2098-05-01', -1, 'spoof creator', id, 2098, 'pending',
      (SELECT id FROM guard_actors WHERE key = 'member'),
      (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1), 'expense'
    FROM guard_groups WHERE key = 'open'$$,
  '42501', NULL, '会計 INSERT creator must be the actor');
SELECT throws_ok(
  $$UPDATE public.transactions SET created_by = auth.uid()
    WHERE id = md5('prb tx other')::uuid$$,
  '42501', NULL, 'non-admin 会計 cannot change created_by');
SELECT throws_ok(
  $$UPDATE public.transactions SET approval_status = 'approved',
      approved_by = (SELECT id FROM guard_actors WHERE key = 'admin')
    WHERE id = md5('prb tx other')::uuid$$,
  '42501', NULL, '会計 cannot attribute approval to another person');
SELECT throws_ok(
  $$UPDATE public.transactions SET approved_by = auth.uid()
    WHERE id = md5('prb tx other')::uuid$$,
  '42501', NULL, 'standalone approved_by reassignment requires admin');
SELECT throws_ok(
  $$UPDATE public.transactions SET approval_status = 'approved'
    WHERE id = md5('prb tx other')::uuid$$,
  '42501', NULL, 'a non-admin approval requires approved_by equal to actor');
SELECT lives_ok(
  $$UPDATE public.transactions SET approval_status = 'rejected', approved_by = auth.uid(),
      approved_at = now(), rejected_reason = 'reason'
    WHERE id = md5('prb tx other')::uuid$$,
  '会計 can reject another creator''s row with their own attribution');
SELECT is((SELECT approved_by FROM public.transactions WHERE id = md5('prb tx other')::uuid),
  auth.uid(), 'the decision records the actual approver');
SELECT lives_ok(
  $$UPDATE public.transactions SET approval_status = 'pending', approved_by = NULL,
      approved_at = NULL, rejected_reason = NULL
    WHERE id = md5('prb tx other')::uuid$$,
  '会計 edit-form reset to pending clears approval fields');
SELECT ok((SELECT approval_status = 'pending' AND approved_by IS NULL AND approved_at IS NULL
    AND rejected_reason IS NULL FROM public.transactions WHERE id = md5('prb tx other')::uuid),
  'edit-form reset persisted');

SELECT set_config('request.jwt.claims', json_build_object('sub', id,
  'role', 'authenticated')::text, true) FROM guard_actors WHERE key = 'member';
SELECT lives_ok(
  $$UPDATE public.transactions SET description = 'legacy edited',
      accounting_group_id = (SELECT id FROM guard_groups WHERE key = 'other')
    WHERE id = md5('prb tx legacy')::uuid$$,
  'historical outsider can edit content while resubmitting the unchanged group');
SELECT is((SELECT description FROM public.transactions WHERE id = md5('prb tx legacy')::uuid),
  'legacy edited', 'the historical outsider content edit persisted');

SELECT set_config('request.jwt.claims', json_build_object('sub', id,
  'role', 'authenticated')::text, true) FROM guard_actors WHERE key = 'accountant';
SELECT lives_ok(
  $$UPDATE public.transactions SET description = 'historical edited', approval_status = 'approved'
    WHERE id = md5('prb tx historical')::uuid$$,
  'historical self-approved row permits content edits with unchanged approval');
SELECT ok((SELECT description = 'historical edited' AND created_by = approved_by
    AND approval_status = 'approved' FROM public.transactions WHERE id = md5('prb tx historical')::uuid),
  'historical self-approval and content remain intact');


SELECT lives_ok(
  $$UPDATE public.transactions SET approval_status = 'approved', approved_by = auth.uid()
    WHERE id = md5('prb tx other')::uuid$$,
  '会計 can approve another creator with actor attribution');
SELECT lives_ok(
  $$UPDATE public.transactions SET approval_status = 'accepted', rejected_reason = NULL
    WHERE id = md5('prb tx other')::uuid$$,
  'later edit-form status transitions preserve the existing approver');
SELECT is((SELECT approved_by FROM public.transactions WHERE id = md5('prb tx other')::uuid),
  auth.uid(), 'later status transition preserves attribution');
SELECT throws_ok(
  $$UPDATE public.transactions SET approval_status = 'refunded',
      approved_by = (SELECT id FROM guard_actors WHERE key = 'admin')
    WHERE id = md5('prb tx other')::uuid$$,
  '42501', NULL, 'later status changes cannot hide approver reassignment');

-- The SECURITY DEFINER transfer RPC still inserts both pending legs, even with
-- the accountant JWT present. It executes as its owner, not authenticated.
SELECT lives_ok(
  $$SELECT public.create_transfer('2098-05-01', 10,
    (SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1),
    (SELECT id FROM public.financial_accounts WHERE name <> '金庫' LIMIT 1),
    'prb transfer', NULL, NULL, auth.uid())$$,
  'SECURITY DEFINER create_transfer remains functional');
SELECT is((SELECT count(*) FROM public.transactions WHERE description = 'prb transfer'
    AND transaction_kind = 'transfer' AND approval_status = 'pending' AND created_by = auth.uid()),
  2::bigint, 'create_transfer persisted both attributed pending legs');

RESET ROLE;
-- Keep the self-row JWT: the exemption must depend on current_user, not JWT role.
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$UPDATE public.transactions SET approval_status = 'approved', approved_by = created_by,
      created_by = md5('prb actor member')::uuid,
      accounting_group_id = md5('prb group team')::uuid
    WHERE id = md5('prb tx self')::uuid$$,
  'service_role can reassign people, approve and move without API guards');
RESET ROLE;
SELECT ok((SELECT approval_status = 'approved' AND approved_by = (SELECT id FROM guard_actors WHERE key = 'accountant')
    AND created_by = (SELECT id FROM guard_actors WHERE key = 'member')
    AND accounting_group_id = md5('prb group team')::uuid
    FROM public.transactions WHERE id = md5('prb tx self')::uuid),
  'service_role write persisted despite a self-row JWT');
SET LOCAL ROLE authenticated;
SELECT ok(NOT public.can_file_into_group(md5('prb missing group')::uuid)
    AND NOT public.can_file_into_group(NULL), 'missing and NULL group IDs fail closed');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
