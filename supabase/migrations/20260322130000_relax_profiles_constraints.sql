-- Migration: Relax NOT NULL constraints on profiles for non-student accounts
-- Accounts like '会計' do not have a student_number or grade

ALTER TABLE public.profiles
  ALTER COLUMN student_number DROP NOT NULL,
  ALTER COLUMN grade DROP NOT NULL;

-- Also drop unused columns that no longer exist in dev
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS avatar_url;
