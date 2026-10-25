BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users (id, email)
SELECT ('d2510000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'delete-member-' || n || '@example.test'
FROM generate_series(1, 8) n;
INSERT INTO public.profiles (id, name, student_number, grade)
SELECT ('d2510000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Delete member ' || n, '99700' || n, 1
FROM generate_series(1, 8) n ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.roles (id, name, type, accounting_group_id) VALUES
('d2520000-0000-4000-8000-000000000001', '副部長', 'general', NULL),
('d2520000-0000-4000-8000-000000000002', 'Deletion regular', 'general', NULL),
('d2520000-0000-4000-8000-000000000003', 'Deletion admin', 'admin', NULL),
('d2520000-0000-4000-8000-000000000004', '会計', 'accounting', NULL),
('d2520000-0000-4000-8000-000000000005', 'Unknown role', 'future', NULL);
INSERT INTO public.user_roles (user_id, role_id) VALUES
('d2510000-0000-4000-8000-000000000001', 'd2520000-0000-4000-8000-000000000001'),
('d2510000-0000-4000-8000-000000000002', 'd2520000-0000-4000-8000-000000000002'),
('d2510000-0000-4000-8000-000000000003', 'd2520000-0000-4000-8000-000000000003'),
('d2510000-0000-4000-8000-000000000004', 'd2520000-0000-4000-8000-000000000004'),
('d2510000-0000-4000-8000-000000000005', 'd2520000-0000-4000-8000-000000000002'),
('d2510000-0000-4000-8000-000000000006', 'd2520000-0000-4000-8000-000000000005'),
('d2510000-0000-4000-8000-000000000007', 'd2520000-0000-4000-8000-000000000002');
INSERT INTO public.accounting_groups (id, name, type) VALUES ('d2530000-0000-4000-8000-000000000001', 'Protected group', 'general');
INSERT INTO public.roles (id, name, type, accounting_group_id) VALUES
('d2520000-0000-4000-8000-000000000006', 'Group general', 'general', 'd2530000-0000-4000-8000-000000000001');
INSERT INTO public.user_roles (user_id, role_id) VALUES
('d2510000-0000-4000-8000-000000000008', 'd2520000-0000-4000-8000-000000000006');
SELECT plan(20);
SELECT ok(NOT has_function_privilege('anon', 'public.soft_delete_member(uuid)', 'EXECUTE'), 'anon cannot execute');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.soft_delete_member('d2510000-0000-4000-8000-000000000002')$$,
'42501', NULL, 'anon execution is denied');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"d2510000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.soft_delete_member('d2510000-0000-4000-8000-000000000001')$$,
'42501', 'Cannot delete yourself', 'self-delete denied');
SELECT throws_ok($$SELECT public.soft_delete_member('d2510000-0000-4000-8000-000000000003')$$,
'42501', 'Protected member requires admin', 'manager cannot delete admin');
SELECT throws_ok($$SELECT public.soft_delete_member('d2510000-0000-4000-8000-000000000004')$$,
'42501', 'Protected member requires admin', 'manager cannot delete accounting');
SELECT throws_ok($$SELECT public.soft_delete_member('d2510000-0000-4000-8000-000000000006')$$,
'42501', 'Protected member requires admin', 'unknown role fails closed');
SELECT throws_ok($$SELECT public.soft_delete_member('d2510000-0000-4000-8000-000000000008')$$,
'42501', 'Protected member requires admin', 'group role is protected even with general type');
SELECT is(public.soft_delete_member('d2510000-0000-4000-8000-000000000002'),
'd2510000-0000-4000-8000-000000000002'::uuid, 'non-admin manager can soft-delete');
SELECT ok((SELECT deleted_at IS NOT NULL FROM public.profiles WHERE id = 'd2510000-0000-4000-8000-000000000002'), 'profile preserved and marked');
SELECT is((SELECT count(*) FROM public.user_roles WHERE user_id = 'd2510000-0000-4000-8000-000000000002'), 0::bigint, 'roles removed');
SELECT is((SELECT count(*) FROM public.audit_logs WHERE record_id = 'd2510000-0000-4000-8000-000000000002' AND action = 'SOFT_DELETE'
AND old_data ->> 'name' = 'Delete member 2' AND new_data ->> 'deleted_at' IS NOT NULL), 1::bigint, 'one complete audit row');
SELECT is(public.soft_delete_member('d2510000-0000-4000-8000-000000000002'),
'd2510000-0000-4000-8000-000000000002'::uuid, 'original manager retry is a no-op');
SELECT is((SELECT count(*) FROM public.audit_logs WHERE record_id = 'd2510000-0000-4000-8000-000000000002' AND action = 'SOFT_DELETE'), 1::bigint, 'retry does not duplicate audit');
SELECT set_config('request.jwt.claims', '{"sub":"d2510000-0000-4000-8000-000000000004","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.soft_delete_member('d2510000-0000-4000-8000-000000000002')$$,
'42501', 'Deleted member retry requires original operator or admin', 'another manager cannot adopt deleted target');
SELECT set_config('request.jwt.claims', '{"sub":"d2510000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.soft_delete_member('d2510000-0000-4000-8000-000000000007')$$,
'42501', 'Member management permission required', 'ordinary member denied');
SELECT set_config('request.jwt.claims', '{"sub":"d2510000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT is(public.soft_delete_member('d2510000-0000-4000-8000-000000000004'),
'd2510000-0000-4000-8000-000000000004'::uuid, 'admin can delete protected target');
SELECT throws_ok($$SELECT public.soft_delete_member('d2510000-0000-4000-8000-999999999999')$$,
'P0002', 'Member not found', 'missing member raises');
RESET ROLE;
-- Force an audit failure and prove all earlier changes roll back with it.
CREATE FUNCTION pg_temp.reject_member_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test audit failure'; END;
$$;
CREATE TRIGGER reject_member_audit BEFORE INSERT ON public.audit_logs
FOR EACH ROW WHEN (NEW.record_id = 'd2510000-0000-4000-8000-000000000007') EXECUTE FUNCTION pg_temp.reject_member_audit();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.soft_delete_member('d2510000-0000-4000-8000-000000000007')$$,
'P0001', 'test audit failure', 'audit failure aborts RPC');
SELECT ok((SELECT deleted_at IS NULL FROM public.profiles WHERE id = 'd2510000-0000-4000-8000-000000000007'), 'profile rollback on audit failure');
SELECT is((SELECT count(*) FROM public.user_roles WHERE user_id = 'd2510000-0000-4000-8000-000000000007'), 1::bigint, 'roles rollback on audit failure');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
