-- Dummy seed data for local development (and optionally staging).
-- Applied by `supabase db reset`; `supabase db push` never applies this file.
-- Every statement is idempotent. Do not add real users or personal data here.
--
-- Data already seeded by migrations (not repeated here):
--   - financial_accounts: '金庫', '銀行口座'
--   - accounting_groups: '部全体'
--   - system_config: accounting_user_id = 9701edd2-bd9d-4d57-9dd6-7235686103bf
--
-- The first admin login user is NOT seeded. Create it in Studio
-- (Authentication > Users > Add user) and grant the admin role as documented in
-- docs/manual/dev-environment/local-setup.md.

-- Current fiscal year (April to March).
INSERT INTO public.fiscal_years (year, start_date, end_date, is_current)
VALUES (2026, DATE '2026-04-01', DATE '2027-03-31', true)
ON CONFLICT (year) DO NOTHING;

-- Demo accounting group (team) for local testing.
INSERT INTO public.accounting_groups (name, type, is_active)
VALUES ('Local Demo Team', 'general', true)
ON CONFLICT (name) DO NOTHING;

-- Global roles used by is_admin() / has_role('会計').
INSERT INTO public.roles (name, type, accounting_group_id)
SELECT 'Local Admin', 'admin', NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.roles
  WHERE type = 'admin' AND accounting_group_id IS NULL
);

INSERT INTO public.roles (name, type, accounting_group_id)
SELECT '会計', 'accounting', NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.roles
  WHERE name = '会計' AND accounting_group_id IS NULL
);

-- Accounting system user referenced by system_config.accounting_user_id and
-- ACCOUNTING_USER_ID_FALLBACK (lib/system-config.shared.ts). The app writes this
-- ID into transactions.created_by / approved_by, so a matching profile must
-- exist. This auth user has no password and cannot sign in.
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '9701edd2-bd9d-4d57-9dd6-7235686103bf',
  'authenticated',
  'authenticated',
  'accounting-system@example.invalid',
  '',
  NOW(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, name)
VALUES ('9701edd2-bd9d-4d57-9dd6-7235686103bf', '会計')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_id)
SELECT '9701edd2-bd9d-4d57-9dd6-7235686103bf', r.id
FROM public.roles r
WHERE r.name = '会計' AND r.accounting_group_id IS NULL
ON CONFLICT (user_id, role_id) DO NOTHING;
