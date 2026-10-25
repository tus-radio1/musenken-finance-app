BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users (id, email) VALUES ('d2610000-0000-4000-8000-000000000001', 'receipt-cleanup@example.test');
INSERT INTO public.profiles (id, name, student_number, grade) VALUES
('d2610000-0000-4000-8000-000000000001', 'Receipt cleanup', '9971001', 1) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fiscal_years (year, start_date, end_date) VALUES (2097, '2097-04-01', '2098-03-31');
INSERT INTO public.accounting_groups (id, name, type) VALUES ('d2620000-0000-4000-8000-000000000001', 'Receipt cleanup', 'general');
INSERT INTO public.transactions (id, date, amount, description, accounting_group_id, fiscal_year_id, created_by,
financial_account_id, transaction_kind, receipt_url) VALUES
('d2630000-0000-4000-8000-000000000001', '2097-05-01', -100, 'Evidence',
'd2620000-0000-4000-8000-000000000001', 2097, 'd2610000-0000-4000-8000-000000000001',
(SELECT id FROM public.financial_accounts WHERE name = '金庫' LIMIT 1), 'expense',
'https://host/storage/v1/object/public/receipts/d2610000-0000-4000-8000-000000000001/receipt.pdf');
INSERT INTO public.subsidy_items (id, category, term, expense_type, accounting_group_id, applicant_id,
fiscal_year_id, name, requested_amount, status, evidence_url, deleted_at) VALUES
('d2640000-0000-4000-8000-000000000001', 'activity', 1, 'equipment',
'd2620000-0000-4000-8000-000000000001', 'd2610000-0000-4000-8000-000000000001', 2097, 'Evidence', 100, 'pending',
'd2610000-0000-4000-8000-000000000001/evidence.pdf', now());
SELECT plan(13);
SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_receipt_cleanup(text, uuid)', 'EXECUTE'), 'only service role may claim cleanup');
SELECT ok(NOT public.claim_receipt_cleanup('someone-else/file.pdf', 'd2610000-0000-4000-8000-000000000001'), 'foreign prefix refused');
SELECT ok(NOT public.claim_receipt_cleanup('d2610000-0000-4000-8000-000000000001/receipt.pdf', 'd2610000-0000-4000-8000-000000000001'), 'legacy URL reference blocks cleanup');
SELECT ok(NOT public.claim_receipt_cleanup('d2610000-0000-4000-8000-000000000001/evidence.pdf', 'd2610000-0000-4000-8000-000000000001'), 'soft-deleted evidence blocks cleanup');
SELECT ok(public.claim_receipt_cleanup('d2610000-0000-4000-8000-000000000001/abandoned.pdf', 'd2610000-0000-4000-8000-000000000001'), 'unreferenced caller upload is claimed');
SELECT throws_ok($$UPDATE public.transactions SET receipt_url = 'd2610000-0000-4000-8000-000000000001/abandoned.pdf'
WHERE id = 'd2630000-0000-4000-8000-000000000001'$$, '23514',
'Receipt upload has been discarded; upload it again', 'claim prevents later reference before storage removal');
SELECT throws_ok($$UPDATE public.subsidy_items SET receipt_url = 'https://host/storage/v1/object/sign/receipts/d2610000-0000-4000-8000-000000000001%2Fabandoned.pdf?token=x'
WHERE id = 'd2640000-0000-4000-8000-000000000001'$$, '23514',
'Receipt upload has been discarded; upload it again', 'encoded URL cannot bypass claim guard');
DELETE FROM public.transactions WHERE id = 'd2630000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*) FROM public.audit_logs WHERE record_id = 'd2630000-0000-4000-8000-000000000001'
AND action = 'DELETE' AND old_data ->> 'receipt_url' LIKE '%/receipt.pdf'), 1::bigint, 'physical transaction delete records evidence once');
SELECT ok(NOT public.claim_receipt_cleanup('d2610000-0000-4000-8000-000000000001/receipt.pdf', 'd2610000-0000-4000-8000-000000000001'), 'deleted transaction evidence cannot be removed');
DELETE FROM public.subsidy_items WHERE id = 'd2640000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*) FROM public.audit_logs WHERE record_id = 'd2640000-0000-4000-8000-000000000001'
AND action = 'DELETE' AND old_data ->> 'evidence_url' LIKE '%/evidence.pdf'), 1::bigint, 'physical subsidy delete records evidence');
SELECT ok(NOT public.claim_receipt_cleanup('d2610000-0000-4000-8000-000000000001/evidence.pdf', 'd2610000-0000-4000-8000-000000000001'), 'deleted subsidy evidence cannot be removed');
SELECT ok(public.claim_receipt_cleanup('d2610000-0000-4000-8000-000000000001/abandoned.pdf', 'd2610000-0000-4000-8000-000000000001'), 'cleanup claim can be retried after storage failure');
SELECT is(public.receipt_reference_name('https://host/storage/v1/object/public/receipts/user%2Ffile.pdf?x=y'), 'user/file.pdf', 'SQL URL normalization matches the report');
SELECT * FROM finish();
ROLLBACK;
