-- Deploy after the accounting grants and app. roles.type is unconstrained TEXT
-- in the initial schema and every subsequent migration; accounting is already
-- used by local/staging seed data, so no CHECK/enum alteration is needed.
-- Preserve role IDs, memberships, group-specific roles and the separate Admin
-- role. Re-running this statement, including on local/staging, is a no-op.
UPDATE public.roles
SET type = 'accounting'
WHERE name = '会計'
  AND accounting_group_id IS NULL
  AND type = 'admin';
