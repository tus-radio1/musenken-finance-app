-- Migration: Ensure soft-delete columns exist on all referenced tables
-- Purpose: Prevent runtime errors like "column <table>.deleted_at does not exist"
-- Note: Safe to run multiple times (idempotent).

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.subsidy_items
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at
  ON public.transactions (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subsidy_items_deleted_at
  ON public.subsidy_items (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON public.profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;
